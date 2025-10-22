import chalk from "chalk"
import figlet from "figlet"
import yargs from "yargs"
import ora from 'ora'
import OpenAI from 'openai'
import { $ } from "zx/core"
import { loadConfig } from "./config.js"
import { checkForUpdates } from './updater.js'
import { zodResponseFormat } from "openai/helpers/zod"
import { z } from "zod"
import { ConfigProviderForm } from "./wizard.js"
import { exit } from "process"
import { CommitSelector } from "./commit-ui.js"

const CommitMessage = z.object({
    messages: z.array(z.object({
        message: z.string()
    }))
})

interface DiffCommit {
    diff: string | null
    prevCommit: string | null
    error: string | null
}

const argv = await yargs(process.argv.slice(2)).options({
    config: {
        type: 'boolean',
        default: false
    },
    configUpdate: {
        name: 'config-update',
        type: 'boolean',
        default: false
    },
    show: {
        type: 'boolean',
        default: false
    }
}).parseAsync()

export async function main() {
    console.log(chalk.red(figlet.textSync('Commit Ah!')))

    await checkForUpdates()

    if (argv.config) {
        await showCurrentConfig()
    } else if (argv.configUpdate) {
        await promptAndUpdateConfig()
    } else {
        start(argv.show)
    }
}

async function start(show: boolean) {
    await checkproviderApiKey()

    const diff = await getGitDiff()
    const colors = [chalk.red, chalk.yellow, chalk.green, chalk.blue, chalk.magenta, chalk.cyan]

    if (diff.diff) {
        const spinner = ora({
            text: 'Generating commit..',
            spinner: {
                interval: 80,
                frames: Array.from({ length: colors.length }, (_, i) => {
                    const color = colors[i]
                    return color(i % 2 === 0 ? '✦' : '✧')
                })
            }
        })

        const diffAsContext = JSON.stringify(diff.diff)
        const prevCommit = diff.prevCommit ? JSON.stringify(diff.prevCommit) : ''

        spinner.start()
        const textCommitMessage = await generateCommitMessages(diffAsContext, prevCommit)
        spinner.stop()

        try {
            const selector = new CommitSelector()
            const answer = await selector.showMessages(textCommitMessage)

            if (answer === null) {
                console.log(chalk.yellow('Commit selection cancelled'))
                return
            }

            if (show) {
                console.log(chalk.green(`\n    '${answer}'\n`))
            } else {
                spinner.text = 'Git committing...'
                spinner.start()

                const commitMessage: string = answer

                const gitCommit = await $`git commit -m ${commitMessage}`.nothrow().quiet()
                const commitOutput = gitCommit.stdout.trim()
                if (gitCommit.exitCode !== 0) {
                    spinner.fail(`Something error: ${commitOutput}`)
                } else {
                    spinner.succeed(commitOutput)
                }
            }
        } catch (error) {
            console.log(error)
            spinner.fail('Something error')
        }

    } else {
        console.error('Something went wrong. Make sure there are staged changes using "git add".')
        process.exit(0)
    }
}

async function showCurrentConfig() {
    const currentConfigString = `

    Provider                : ${loadConfig().provider}
    Provider URL            : ${loadConfig().providerUrl}
    Provider API key        : ${loadConfig().providerApiKey}
    AI Model                : ${loadConfig().model}
    Message Specification   : ${loadConfig().messageSpec}
    Output count            : ${loadConfig().sizeOption}
    
    `
    console.log(currentConfigString)
}

async function promptAndUpdateConfig() {
    const configForm = new ConfigProviderForm()
    await configForm.run()

    console.log("Configuration updated successfully:", loadConfig())
}

async function getGitDiff(): Promise<DiffCommit> {
    let diffCommit: DiffCommit = {
        diff: null,
        prevCommit: null,
        error: null
    }

    try {
        const isGitInstalled = await $`git --version`.nothrow().quiet()
        if (isGitInstalled.exitCode !== 0) {
            console.error("Error: Git is not installed or not found in PATH.")
            diffCommit.error = "Error: Git is not installed or not found in PATH."
            return diffCommit
        }

        const isInsideGitRepo = await $`git rev-parse --is-inside-work-tree`.nothrow().quiet()
        if (isInsideGitRepo.exitCode !== 0) {
            console.error("Error: Not a git repository. Please initialize git with 'git init'.")
            diffCommit.error = "Error: Not a git repository. Please initialize git with 'git init'."
            return diffCommit
        }

        const hasPreviousCommit = await $`git rev-list --max-count=1 HEAD`.nothrow().quiet()

        if (hasPreviousCommit.exitCode !== 0) {
            const diffResult = await $`git diff --staged --unified=5 --color=never`.nothrow().quiet()
            diffCommit.diff = diffResult.stdout.trim()
            diffCommit.prevCommit = 'Initial commit'
            return diffCommit
        }

        const diffResult = await $`git diff --staged --unified=5 --color=never`.nothrow().quiet()
        const prevCommits = await $`git log --pretty=format:"%s"`.nothrow().quiet()
        diffCommit.error = null
        diffCommit.diff = diffResult.stdout.trim()
        diffCommit.prevCommit = prevCommits.stdout.trim()
        return diffCommit

    } catch (error) {
        console.error("An error occurred:", error)
        diffCommit.error = "An error occurred"
        return diffCommit
    }
}

async function checkproviderApiKey() {

    if (!loadConfig().providerApiKey || !loadConfig().providerUrl) {
        const configForm = new ConfigProviderForm()
        await configForm.run()

        if (!loadConfig().providerApiKey || !loadConfig().providerUrl) {
            console.error('Provider not set, exiting...')
            exit(0)
        }
    }

}

async function generateCommitMessages(diff: string, prevCommit: string): Promise<string[]> {
    const config = loadConfig()
    let baseUrl = config.providerUrl

    if (!isURL(baseUrl)) {
        console.error(`\nUrl provider is broken! Please run 'commitah --config-update' and re-config again.`)
        exit(0)
    }

    if (config.provider === 'Ollama') {
        const ollamaBaseUrl = config.providerUrl + '/v1'
        baseUrl = ollamaBaseUrl.replace(/([^:])\/\/+/g, '$1/').replace(/(\/v1)(?:\/v1)+/g, '$1')
    }

    const openai = new OpenAI({
        baseURL: baseUrl,
        apiKey: config.providerApiKey
    })

    const systemMessage = `
    You are an expert at analyzing the git diff changes.
    
    Follow these rules for commit messages:
    1. Format: <type>[scope]([optional context]): <long description>
    
    2. Follow Conventional Commits rules with scope types

    3. Message should be minimum 90 characters and maximum 110 characters

    4. Message should be more highly technical, include file name or function

    Follow this additional rules: ${config.messageSpec}
    `

    try {
        const completion = await openai.beta.chat.completions.parse({
            model: config.model || "gpt-4",
            messages: [
                {
                    role: "system",
                    content: systemMessage
                },
                {
                    role: "user",
                    content: `Previous commits: ${prevCommit}\nCurrent diff: ${diff}\nProvide ${config.sizeOption} alternative commit message options following conventional commit format and previous commits.`
                }
            ],
            response_format: zodResponseFormat(CommitMessage, "commitSuggestions")
        }).catch(error => {
            if (error.status === 401) {
                console.error(`Authentication error: Invalid API key for ${config.provider}`)
                exit(1)
            }
            if (error.status === 404) {
                console.error(`Model ${config.model} not found in ${config.provider}`)
                exit(1)
            }
            if (error.status === 429) {
                console.error(`Rate limit exceeded for ${config.provider}`)
                exit(1)
            }
            throw error
        })

        if (!completion) {
            console.error(`Failed to get response from ${config.provider}`)
            exit(1)
        }

        const parsed = completion.choices[0]?.message?.parsed
        if (!parsed) {
            console.error(`No parsed result from ${config.provider}`)
            exit(1)
        }

        return parsed.messages.map(item => item.message)
    } catch (error) {
        console.error(`Error generating commit messages from ${config.provider}:`, error)
        exit(1)
    }
}

function isURL(string: string): boolean {
    const urlRegex = /^(https?:\/\/)?(www\.)?([a-zA-Z0-9\-\.]+\.)+([a-zA-Z0-9\-\/]+)(:[0-9]+)?([/?#]*)*$/;
    return urlRegex.test(string);
}
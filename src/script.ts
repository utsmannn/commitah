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
import { CommitSelector, CommitOption } from "./commit-ui.js"

const CommitMessage = z.object({
    messages: z.array(z.object({
        header: z.string().describe("The commit header/subject line (max 72 chars, conventional commit format)"),
        body: z.string().optional().describe("Optional detailed explanation of what and why")
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
        await start(argv.show)
    }
}

async function start(show: boolean) {
    await checkproviderApiKey()

    const diff = await getGitDiff()
    const colors = [chalk.red, chalk.yellow, chalk.green, chalk.blue, chalk.magenta, chalk.cyan]

    if (diff.error) {
        console.error(diff.error)
        process.exit(1)
    }

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
        const commitOptions = await generateCommitMessages(diffAsContext, prevCommit)
        spinner.stop()

        try {
            const selector = new CommitSelector()
            const result = await selector.showMessages(commitOptions)

            if (result === null) {
                console.log(chalk.yellow('Commit selection cancelled'))
                return
            }

            if (show) {
                console.log(chalk.green(`\nHeader: ${result.header}`))
                if (result.body) {
                    console.log(chalk.gray(`\nBody:\n${result.body}`))
                }
                console.log()
            } else {
                spinner.text = 'Git committing...'
                spinner.start()

                const gitCommit = result.body?.trim()
                    ? await $`git commit -m ${result.header} -m ${result.body}`.nothrow().quiet()
                    : await $`git commit -m ${result.header}`.nothrow().quiet()
                const commitOutput = (gitCommit.stdout || gitCommit.stderr).trim()
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
        // Check if there are any changes at all (staged or unstaged)
        const status = await $`git status --porcelain`.nothrow().quiet()

        if (!status.stdout.trim()) {
            console.log(chalk.yellow('\nNo changes to commit. Working tree is clean.\n'))
        } else {
            console.log(chalk.yellow('\nNo staged changes to commit. Stage your changes first.\n'))
            console.log(chalk.gray('Git status:'))
            console.log(status.stdout.trim())
        }
        process.exit(0)
    }
}

async function showCurrentConfig() {
    const config = loadConfig()
    const currentConfigString = `

    Provider                : ${config.provider}
    Provider URL            : ${config.providerUrl}
    Provider API key        : ${config.providerApiKey}
    AI Model                : ${config.model}
    Output count            : ${config.sizeOption}

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
    const hasValidConfig = () => {
        const config = loadConfig()
        if (!config.providerUrl) {
            return false
        }

        if (config.provider === 'Ollama') {
            return true
        }

        return Boolean(config.providerApiKey)
    }

    if (!hasValidConfig()) {
        const configForm = new ConfigProviderForm()
        await configForm.run()

        if (!hasValidConfig()) {
            console.error('Provider not set, exiting...')
            exit(0)
        }
    }
}

async function generateCommitMessages(diff: string, prevCommit: string): Promise<CommitOption[]> {
    const config = loadConfig()
    let baseUrl = config.providerUrl

    if (!isURL(baseUrl)) {
        console.error(`\nUrl provider is broken! Please run 'commitah --config-update' and re-config again.`)
        exit(1)
    }

    if (config.provider === 'Ollama') {
        const ollamaBaseUrl = config.providerUrl + '/v1'
        baseUrl = ollamaBaseUrl.replace(/([^:])\/\/+/g, '$1/').replace(/(\/v1)(?:\/v1)+/g, '$1')
    }

    const openai = new OpenAI({
        baseURL: baseUrl,
        apiKey: config.providerApiKey
    })

    // Providers that support structured output (response_format with json_schema)
    const structuredOutputProviders = ['OpenAI', 'Gemini', 'DeepSeek']
    const useStructuredOutput = structuredOutputProviders.includes(config.provider)

    const systemMessage = `You are an expert at writing clear, meaningful git commit messages based on code diffs.

Generate commit messages following Conventional Commits format:

HEADER FORMAT: <type>(<scope>): <description>
- Types: feat, fix, docs, style, refactor, perf, test, chore, build, ci
- Scope: optional, indicates the affected module/component
- Description: imperative mood ("add" not "added"), max 72 chars
- Be specific about WHAT changed, not just the file names

BODY (optional): Include for complex changes
- Explain WHY the change was made
- Describe any important implementation details
- Wrap at 72 characters per line
- Leave empty for simple, self-explanatory changes

EXAMPLES:
- feat(auth): add OAuth2 login with Google provider
- fix(api): handle null response in user endpoint
- refactor(db): extract connection pool to separate module
- chore: update dependencies to latest versions

Focus on the intent and impact of changes, not just what files were modified.`

    const userMessage = `Here are the recent commits for context:\n${prevCommit}\n\nHere is the current staged diff:\n${diff}\n\nGenerate ${config.sizeOption} commit message options. Include body only when the changes are complex or need explanation.`

    try {
        if (useStructuredOutput) {
            // Use structured output for providers that support it
            const completion = await openai.beta.chat.completions.parse({
                model: config.model || "gpt-4",
                messages: [
                    { role: "system", content: systemMessage },
                    { role: "user", content: userMessage }
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

            return parsed.messages.map(item => ({
                header: item.header,
                body: item.body
            }))
        } else {
            // Fallback: Ask for JSON in the prompt and parse manually
            const jsonSystemMessage = systemMessage + `

IMPORTANT: Respond ONLY with a valid JSON object in this exact format:
{"messages": [{"header": "commit message header", "body": "optional body or empty string"}, ...]}

Do not include any text before or after the JSON. Do not use markdown code blocks.`

            const completion = await openai.chat.completions.create({
                model: config.model || "gpt-4",
                messages: [
                    { role: "system", content: jsonSystemMessage },
                    { role: "user", content: userMessage }
                ]
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

            const content = completion.choices[0]?.message?.content || ''

            // Try to extract JSON from the response
            let jsonStr = content.trim()

            // Remove markdown code blocks if present
            if (jsonStr.startsWith('```')) {
                jsonStr = jsonStr.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '')
            }

            try {
                const parsed = JSON.parse(jsonStr) as { messages: Array<{ header: string; body?: string }> }
                return parsed.messages.map(item => ({
                    header: item.header,
                    body: item.body
                }))
            } catch {
                // If JSON parsing fails, try to extract commit messages from plain text
                const lines = content.split('\n').filter(line => line.trim())
                const messages: CommitOption[] = []

                for (const line of lines) {
                    const cleaned = line.replace(/^[-*\d.)\s]+/, '').trim()
                    if (cleaned && cleaned.match(/^(feat|fix|docs|style|refactor|perf|test|chore|build|ci)/)) {
                        messages.push({ header: cleaned })
                    }
                }

                if (messages.length > 0) {
                    return messages.slice(0, config.sizeOption)
                }

                console.error(`Failed to parse response from ${config.provider}`)
                exit(1)
            }
        }
    } catch (error) {
        console.error(`Error generating commit messages from ${config.provider}:`, error)
        exit(1)
    }
}

function isURL(value: string): boolean {
    try {
        const url = new URL(value)
        return url.protocol === 'http:' || url.protocol === 'https:'
    } catch {
        return false
    }
}
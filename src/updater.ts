import fetch from 'node-fetch'
import { exec } from 'child_process'
import { promisify } from 'util'
import chalk from 'chalk'

interface NpmRegistryResponse {
    'dist-tags': {
        latest: string
    }
}

const execAsync = promisify(exec)
const PACKAGE_NAME = 'commitah'

async function getCurrentVersion(): Promise<string> {
    try {
        const { stdout } = await execAsync(`${PACKAGE_NAME} --version`)
        return stdout.trim()
    } catch (error) {
        return '0.0.0'
    }
}

export async function checkForUpdates(): Promise<void> {
    try {
        const currentVersion = await getCurrentVersion()
        const response = await fetch(`https://registry.npmjs.org/${PACKAGE_NAME}`)
        if (!response.ok) {
            return
        }

        const data = await response.json() as NpmRegistryResponse
        const latestVersion = data['dist-tags'].latest

        if (isNewVersionAvailable(currentVersion, latestVersion)) {
            console.log(chalk.yellow(`\nNew version available: ${chalk.bold(latestVersion)} (current: ${currentVersion})`))
            console.log(chalk.gray('Updating...'))

            const success = await updatePackage(latestVersion)

            if (success) {
                console.log(chalk.green('\nUpdate completed successfully!'))
                console.log(chalk.gray('Run ' + chalk.bold('commitah') + ' again to use the new version.\n'))
                process.exit(0)
            } else {
                console.log(chalk.red('\nUpdate failed. Please run: npm install -g commitah@latest\n'))
                process.exit(1)
            }
        }
    } catch {
        // Silently fail - don't block the tool for update issues
    }
}

function isNewVersionAvailable(currentVersion: string, latestVersion: string): boolean {
    const currentParts = currentVersion.split('.').map(Number)
    const latestParts = latestVersion.split('.').map(Number)

    for (let i = 0; i < latestParts.length; i++) {
        if (latestParts[i] > (currentParts[i] || 0)) {
            return true
        }
        if (latestParts[i] < (currentParts[i] || 0)) {
            return false
        }
    }
    return false
}

async function updatePackage(latestVersion: string): Promise<boolean> {
    try {
        const { stdout, stderr } = await execAsync(`npm install -g ${PACKAGE_NAME}@${latestVersion}`)

        if (stderr && stderr.includes('WARN')) {
            // Warnings are OK
        }

        // Verify the update worked
        const { stdout: versionOutput } = await execAsync(`${PACKAGE_NAME} --version`)
        const newVersion = versionOutput.trim()

        return newVersion === latestVersion
    } catch (error) {
        console.error(chalk.red('Error updating package:'), error)
        return false
    }
}
import fetch from 'node-fetch'
import chalk from 'chalk'
import { createRequire } from 'module'

interface NpmRegistryResponse {
    'dist-tags': {
        latest: string
    }
}

const PACKAGE_NAME = 'commitah'
const require = createRequire(import.meta.url)

async function getCurrentVersion(): Promise<string> {
    try {
        const packageJson = require('../package.json') as { version?: string }
        return packageJson.version || '0.0.0'
    } catch {
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
            console.log(chalk.gray(`Update manually with: npm install -g ${PACKAGE_NAME}@latest\n`))
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


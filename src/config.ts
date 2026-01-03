import * as fs from "fs"
import * as path from "path"

interface Config {
    readonly providerApiKey: string
    readonly provider: string
    readonly providerUrl: string
    readonly sizeOption: number
    readonly model: string
}

function createDefaultConfig(): Config {
    return {
        provider: "",
        providerApiKey: "",
        providerUrl: "",
        sizeOption: 3,
        model: "gpt-4o"
    }
}

export function getConfigPath(): string {
    const homeDir = process.env.HOME || process.env.USERPROFILE
    return path.join(homeDir!, ".commitahconfig-v2")
}

export function loadConfig(): Config {
    const configPath = getConfigPath()

    if (!fs.existsSync(configPath)) {
        console.warn("Config file not found, creating default config.")
        saveConfig(createDefaultConfig())
        return createDefaultConfig()
    }

    try {
        const fileContent = fs.readFileSync(configPath, "utf8")
        const parsedConfig = JSON.parse(fileContent) as Partial<Config>

        return { ...createDefaultConfig(), ...parsedConfig }
    } catch (error) {
        console.error("Failed to load config file, using default config.", error)
        return createDefaultConfig()
    }
}

function saveConfig(config: Config): void {
    const configPath = getConfigPath()

    try {
        fs.writeFileSync(configPath, JSON.stringify(config, null, 4), "utf8")
        console.log("Config file saved successfully at:", configPath)
    } catch (error) {
        console.error("Failed to save config file.", error)
    }
}

export function updateConfig(newConfig: Partial<Config>): Config {
    const currentConfig = loadConfig()
    const updatedConfig = { ...currentConfig, ...newConfig }
    saveConfig(updatedConfig)
    return updatedConfig
}
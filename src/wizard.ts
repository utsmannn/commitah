// wizard.ts
import blessed from 'blessed'
import { spawn } from 'child_process'
import { loadConfig, updateConfig, getConfigPath } from './config.js'

interface UrlTemplate {
  name: string
  url: string
  defaultModel: string
  requiresApiKey: boolean
}

export class ConfigProviderForm {
  private screen: blessed.Widgets.Screen
  private mainBox: blessed.Widgets.BoxElement
  private providerLabel!: blessed.Widgets.TextElement
  private baseUrlField!: blessed.Widgets.TextboxElement
  private baseUrlLabel!: blessed.Widgets.TextElement
  private apiKeyField!: blessed.Widgets.TextboxElement
  private modelField!: blessed.Widgets.TextboxElement
  private resultCountField!: blessed.Widgets.TextboxElement
  private submitButton!: blessed.Widgets.ButtonElement
  private cancelButton!: blessed.Widgets.ButtonElement
  private resolveForm?: (value: boolean) => void
  private selectedTemplateIndex = 0
  private currentField = 0 // 0=provider, 1=baseurl, 2=apikey, 3=model, 4=results, 5=save, 6=cancel

  private urlTemplates: UrlTemplate[] = [
    { name: 'OpenAI', url: 'https://api.openai.com/v1', defaultModel: 'gpt-4o', requiresApiKey: true },
    { name: 'Anthropic', url: 'https://api.anthropic.com/v1', defaultModel: 'claude-sonnet-4-5', requiresApiKey: true },
    { name: 'Gemini', url: 'https://generativelanguage.googleapis.com/v1beta/openai/', defaultModel: 'gemini-2.5-flash', requiresApiKey: true },
    { name: 'DeepSeek', url: 'https://api.deepseek.com', defaultModel: 'deepseek-chat', requiresApiKey: true },
    { name: 'Groq', url: 'https://api.groq.com/openai/v1', defaultModel: 'llama-3.3-70b-versatile', requiresApiKey: true },
    { name: 'Mistral', url: 'https://api.mistral.ai/v1', defaultModel: 'mistral-large-latest', requiresApiKey: true },
    { name: 'Together', url: 'https://api.together.xyz/v1', defaultModel: 'meta-llama/Llama-3.3-70B-Instruct-Turbo', requiresApiKey: true },
    { name: 'Fireworks', url: 'https://api.fireworks.ai/inference/v1', defaultModel: 'accounts/fireworks/models/llama-v3p3-70b-instruct', requiresApiKey: true },
    { name: 'OpenRouter', url: 'https://openrouter.ai/api/v1', defaultModel: 'anthropic/claude-3.5-sonnet', requiresApiKey: true },
    { name: 'Cerebras', url: 'https://api.cerebras.ai/v1', defaultModel: 'llama-3.3-70b', requiresApiKey: true },
    { name: 'GLM', url: 'https://api.z.ai/api/coding/paas/v4', defaultModel: 'glm-4.7', requiresApiKey: true },
    { name: 'Ollama', url: 'http://localhost:11434/v1', defaultModel: 'llama3.1', requiresApiKey: false },
    { name: 'Custom', url: '', defaultModel: '', requiresApiKey: true }
  ]

  constructor() {
    this.screen = blessed.screen({
      smartCSR: true,
      title: 'Commitah Configuration'
    })

    this.mainBox = blessed.box({
      parent: this.screen,
      width: '80%',
      height: 18,
      top: 'center',
      left: 'center',
      border: { type: 'line' },
      style: { border: { fg: 'cyan' } }
    })

    blessed.text({
      parent: this.mainBox,
      top: 0,
      left: 'center',
      content: ' ⚙ Commitah Configuration ',
      style: { fg: 'cyan', bold: true }
    })

    this.loadInitialTemplate()
    this.createUI()
    this.setupGlobalKeys()
    this.updateHighlight()
  }

  private loadInitialTemplate(): void {
    const config = loadConfig()
    const index = this.urlTemplates.findIndex(t => t.url === config.providerUrl)
    if (index !== -1) {
      this.selectedTemplateIndex = index
    } else if (config.providerUrl) {
      this.selectedTemplateIndex = this.urlTemplates.length - 1
    }
  }

  private createUI(): void {
    const config = loadConfig()
    const template = this.urlTemplates[this.selectedTemplateIndex]
    const isCustom = template.name === 'Custom'

    // Provider selector (row 0)
    blessed.text({
      parent: this.mainBox,
      top: 2,
      left: 2,
      content: 'Provider:',
      style: { fg: 'white' }
    })

    this.providerLabel = blessed.text({
      parent: this.mainBox,
      top: 2,
      left: 14,
      content: `◀ ${template.name} ▶`,
      style: { fg: 'cyan', bold: true }
    })

    // Base URL (row 1)
    this.baseUrlLabel = blessed.text({
      parent: this.mainBox,
      top: 4,
      left: 2,
      content: 'Base URL:',
      style: { fg: 'white' }
    })

    this.baseUrlField = blessed.textbox({
      parent: this.mainBox,
      top: 4,
      left: 14,
      right: 3,
      height: 1,
      style: {
        fg: isCustom ? 'white' : 'gray',
        bg: 'black',
        focus: { fg: 'white', bg: 'blue' }
      },
      inputOnFocus: false,
      value: config.providerUrl || template.url
    }) as blessed.Widgets.TextboxElement

    // API Key (row 2)
    blessed.text({
      parent: this.mainBox,
      top: 6,
      left: 2,
      content: 'API Key:',
      style: { fg: 'white' }
    })

    this.apiKeyField = blessed.textbox({
      parent: this.mainBox,
      top: 6,
      left: 14,
      right: 3,
      height: 1,
      style: {
        fg: 'white',
        bg: 'black',
        focus: { fg: 'white', bg: 'blue' }
      },
      inputOnFocus: false,
      value: config.providerApiKey || ''
    }) as blessed.Widgets.TextboxElement

    // Model (row 3)
    blessed.text({
      parent: this.mainBox,
      top: 8,
      left: 2,
      content: 'Model:',
      style: { fg: 'white' }
    })

    this.modelField = blessed.textbox({
      parent: this.mainBox,
      top: 8,
      left: 14,
      right: 3,
      height: 1,
      style: {
        fg: 'white',
        bg: 'black',
        focus: { fg: 'white', bg: 'blue' }
      },
      inputOnFocus: false,
      value: config.model || template.defaultModel
    }) as blessed.Widgets.TextboxElement

    // Results (row 4)
    blessed.text({
      parent: this.mainBox,
      top: 10,
      left: 2,
      content: 'Results:',
      style: { fg: 'white' }
    })

    this.resultCountField = blessed.textbox({
      parent: this.mainBox,
      top: 10,
      left: 14,
      width: 10,
      height: 1,
      style: {
        fg: 'white',
        bg: 'black',
        focus: { fg: 'white', bg: 'blue' }
      },
      inputOnFocus: false,
      value: (config.sizeOption || 3).toString()
    }) as blessed.Widgets.TextboxElement

    // Buttons
    this.submitButton = blessed.button({
      parent: this.mainBox,
      top: 12,
      left: 'center',
      content: ' Save ',
      style: {
        fg: 'black',
        bg: 'green',
        focus: { fg: 'white', bg: 'blue' }
      },
      height: 1,
      width: 8
    }) as blessed.Widgets.ButtonElement

    this.cancelButton = blessed.button({
      parent: this.mainBox,
      top: 12,
      left: '50%+6',
      content: ' Cancel ',
      style: {
        fg: 'black',
        bg: 'red',
        focus: { fg: 'white', bg: 'blue' }
      },
      height: 1,
      width: 10
    }) as blessed.Widgets.ButtonElement

    // Help
    blessed.text({
      parent: this.mainBox,
      top: 14,
      left: 'center',
      content: '↑↓:Navigate | ←→:Provider | Enter:Edit | Esc:Done/Cancel | v:Vim',
      style: { fg: 'gray' }
    })
  }

  private setupGlobalKeys(): void {
    this.screen.key(['escape', 'C-c'], () => this.handleCancel())

    this.screen.key(['v'], () => {
      if (!this.isEditing()) {
        this.openInVim()
      }
    })

    this.screen.key(['up', 'k'], () => {
      if (!this.isEditing()) {
        this.navigateUp()
      }
    })

    this.screen.key(['down', 'j', 'tab'], () => {
      if (!this.isEditing()) {
        this.navigateDown()
      }
    })

    this.screen.key(['left', 'h'], () => {
      if (!this.isEditing() && this.currentField === 0) {
        this.changeProvider(-1)
      }
    })

    this.screen.key(['right', 'l'], () => {
      if (!this.isEditing() && this.currentField === 0) {
        this.changeProvider(1)
      }
    })

    this.screen.key(['enter'], () => {
      if (!this.isEditing()) {
        this.handleEnter()
      }
    })
  }

  private isEditing(): boolean {
    const focused = this.screen.focused
    return focused === this.baseUrlField ||
           focused === this.apiKeyField ||
           focused === this.modelField ||
           focused === this.resultCountField
  }

  private navigateUp(): void {
    if (this.currentField > 0) {
      this.currentField--
      this.updateHighlight()
    }
  }

  private navigateDown(): void {
    if (this.currentField < 6) {
      this.currentField++
      this.updateHighlight()
    }
  }

  private isCustomProvider(): boolean {
    return this.urlTemplates[this.selectedTemplateIndex].name === 'Custom'
  }

  private changeProvider(dir: number): void {
    this.selectedTemplateIndex += dir
    if (this.selectedTemplateIndex < 0) {
      this.selectedTemplateIndex = this.urlTemplates.length - 1
    } else if (this.selectedTemplateIndex >= this.urlTemplates.length) {
      this.selectedTemplateIndex = 0
    }

    const template = this.urlTemplates[this.selectedTemplateIndex]
    const isCustom = template.name === 'Custom'

    this.providerLabel.setContent(`◀ ${template.name} ▶`)
    this.baseUrlField.setValue(template.url)
    this.baseUrlField.style.fg = isCustom ? 'white' : 'gray'
    this.modelField.setValue(template.defaultModel)
    this.screen.render()
  }

  private updateHighlight(): void {
    // Reset all styles
    this.providerLabel.style.fg = 'white'
    this.providerLabel.style.bold = false
    this.baseUrlField.style.bg = 'black'
    this.apiKeyField.style.bg = 'black'
    this.modelField.style.bg = 'black'
    this.resultCountField.style.bg = 'black'
    this.submitButton.style.bg = 'green'
    this.cancelButton.style.bg = 'red'

    // Highlight current
    switch (this.currentField) {
      case 0:
        this.providerLabel.style.fg = 'cyan'
        this.providerLabel.style.bold = true
        break
      case 1:
        this.baseUrlField.style.bg = 'blue'
        break
      case 2:
        this.apiKeyField.style.bg = 'blue'
        break
      case 3:
        this.modelField.style.bg = 'blue'
        break
      case 4:
        this.resultCountField.style.bg = 'blue'
        break
      case 5:
        this.submitButton.style.bg = 'blue'
        break
      case 6:
        this.cancelButton.style.bg = 'blue'
        break
    }

    this.screen.render()
  }

  private handleEnter(): void {
    switch (this.currentField) {
      case 0:
        // Provider - do nothing, use arrows
        break
      case 1:
        // Base URL - only editable for Custom
        if (this.isCustomProvider()) {
          this.editField(this.baseUrlField)
        }
        break
      case 2:
        this.editField(this.apiKeyField)
        break
      case 3:
        this.editField(this.modelField)
        break
      case 4:
        this.editField(this.resultCountField)
        break
      case 5:
        this.handleSubmit()
        break
      case 6:
        this.handleCancel()
        break
    }
  }

  private editField(field: blessed.Widgets.TextboxElement): void {
    field.focus()
    field.readInput(() => {
      // Reset focus to mainBox to allow navigation
      this.mainBox.focus()
      this.updateHighlight()
    })
  }

  private handleSubmit(): void {
    const template = this.urlTemplates[this.selectedTemplateIndex]
    const isCustom = template.name === 'Custom'

    // For custom, use the entered URL; otherwise use template URL
    const providerUrl = isCustom ? (this.baseUrlField.value || '') : template.url

    updateConfig({
      provider: template.name,
      providerUrl: providerUrl,
      providerApiKey: this.apiKeyField.value || '',
      model: this.modelField.value || template.defaultModel,
      sizeOption: parseInt(this.resultCountField.value || '3', 10) || 3
    })

    this.screen.destroy()
    if (this.resolveForm) {
      this.resolveForm(true)
    }
  }

  private handleCancel(): void {
    this.screen.destroy()
    if (this.resolveForm) {
      this.resolveForm(false)
    }
  }

  private openInVim(): void {
    const configPath = getConfigPath()
    this.screen.destroy()

    const editor = process.env.EDITOR || 'vim'
    const child = spawn(editor, [configPath], { stdio: 'inherit' })

    child.on('exit', () => {
      if (this.resolveForm) {
        this.resolveForm(true)
      }
    })
  }

  public run(): Promise<boolean> {
    return new Promise((resolve) => {
      this.resolveForm = resolve
      this.screen.render()
    })
  }

  public waitForKey(keys: string[]): Promise<void> {
    return new Promise((resolve) => {
      this.screen.key(keys, () => resolve())
    })
  }
}

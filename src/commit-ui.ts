import blessed from 'blessed'

export interface CommitOption {
    header: string
    body?: string
}

export interface CommitResult {
    header: string
    body?: string
    fullMessage: string
}

export class CommitSelector {
    private screen: blessed.Widgets.Screen
    private mainBox: blessed.Widgets.BoxElement
    private listBox: blessed.Widgets.BoxElement
    private resolveMessage?: (value: CommitResult | null) => void
    private messages: CommitOption[] = []
    private selectedIndex = 0
    private radioElements: blessed.Widgets.BoxElement[] = []

    constructor() {
        this.screen = blessed.screen({
            smartCSR: true,
            title: 'Select Commit Message'
        })

        // Main container
        this.mainBox = blessed.box({
            parent: this.screen,
            width: '95%',
            height: '90%',
            top: 'center',
            left: 'center',
            border: {
                type: 'line'
            },
            style: {
                border: {
                    fg: 'cyan'
                }
            }
        })

        // Title
        blessed.box({
            parent: this.mainBox,
            top: 0,
            left: 'center',
            width: 'shrink',
            height: 1,
            content: ' Select Commit Message ',
            style: {
                fg: 'cyan',
                bold: true
            }
        })

        // List container (scrollable)
        this.listBox = blessed.box({
            parent: this.mainBox,
            top: 2,
            left: 1,
            right: 1,
            bottom: 3,
            scrollable: true,
            alwaysScroll: true,
            scrollbar: {
                ch: '█',
                style: {
                    fg: 'cyan'
                }
            },
            keys: true,
            vi: true,
            mouse: true
        })

        // Help text
        blessed.box({
            parent: this.mainBox,
            bottom: 0,
            left: 'center',
            width: 'shrink',
            height: 1,
            content: '↑↓: Navigate | Enter: Confirm | Esc: Cancel',
            style: {
                fg: 'gray'
            }
        })

        this.setupKeys()
    }

    private setupKeys(): void {
        this.screen.key(['escape', 'C-c'], () => {
            this.screen.destroy()
            if (this.resolveMessage) {
                this.resolveMessage(null)
            }
        })

        this.screen.key(['up', 'k'], () => {
            this.navigate(-1)
        })

        this.screen.key(['down', 'j'], () => {
            this.navigate(1)
        })

        this.screen.key(['enter'], () => {
            this.showConfirmDialog()
        })
    }

    private navigate(direction: number): void {
        const newIndex = this.selectedIndex + direction
        if (newIndex >= 0 && newIndex < this.messages.length) {
            this.selectedIndex = newIndex
            this.updateSelection()
        }
    }

    private updateSelection(): void {
        this.radioElements.forEach((box, index) => {
            const isSelected = index === this.selectedIndex
            const radioChar = isSelected ? '●' : '○'
            const headerLine = box.children[0] as blessed.Widgets.TextElement

            // Update radio character
            if (headerLine) {
                const message = this.messages[index]
                const lines = this.wrapText(message.header, (this.screen.width as number) - 10)
                const content = lines.map((line, i) => {
                    if (i === 0) {
                        return `${radioChar} ${line}`
                    }
                    return `  ${line}`
                }).join('\n')

                headerLine.setContent(content)
                headerLine.style.fg = isSelected ? 'cyan' : 'white'
            }
        })

        // Scroll to selected item if needed
        this.ensureVisible()
        this.screen.render()
    }

    private ensureVisible(): void {
        // Calculate position of selected item
        let totalHeight = 0
        for (let i = 0; i < this.selectedIndex; i++) {
            const lines = this.wrapText(this.messages[i].header, (this.screen.width as number) - 10)
            totalHeight += lines.length + 1 // +1 for spacing
        }

        const listHeight = (this.listBox.height as number) - 2
        const scrollPos = this.listBox.getScroll()

        if (totalHeight < scrollPos) {
            this.listBox.setScroll(totalHeight)
        } else if (totalHeight > scrollPos + listHeight - 3) {
            this.listBox.setScroll(totalHeight - listHeight + 3)
        }
    }

    private wrapText(text: string, maxWidth: number): string[] {
        const words = text.split(' ')
        const lines: string[] = []
        let currentLine = ''

        for (const word of words) {
            if (currentLine.length + word.length + 1 <= maxWidth) {
                currentLine += (currentLine ? ' ' : '') + word
            } else {
                if (currentLine) lines.push(currentLine)
                currentLine = word
            }
        }
        if (currentLine) lines.push(currentLine)

        return lines.length > 0 ? lines : ['']
    }

    private showConfirmDialog(): void {
        const selected = this.messages[this.selectedIndex]
        const hasBody = selected.body && selected.body.trim().length > 0

        // Create dialog overlay
        const dialogBox = blessed.box({
            parent: this.screen,
            top: 'center',
            left: 'center',
            width: '80%',
            height: hasBody ? '60%' : '30%',
            border: {
                type: 'line'
            },
            style: {
                border: {
                    fg: 'green'
                },
                bg: 'black'
            }
        })

        // Dialog title
        blessed.box({
            parent: dialogBox,
            top: 0,
            left: 'center',
            width: 'shrink',
            height: 1,
            content: ' Confirm Commit ',
            style: {
                fg: 'green',
                bold: true
            }
        })

        // Commit message content (header + body combined)
        const fullContent = hasBody
            ? `${selected.header}\n\n${selected.body}`
            : selected.header

        blessed.box({
            parent: dialogBox,
            top: 2,
            left: 2,
            right: 2,
            bottom: 4,
            content: fullContent,
            scrollable: true,
            alwaysScroll: true,
            scrollbar: {
                ch: '█',
                style: {
                    fg: 'gray'
                }
            },
            style: {
                fg: 'white'
            }
        })

        // Buttons
        const buttonBox = blessed.box({
            parent: dialogBox,
            bottom: 1,
            left: 'center',
            width: 40,
            height: 1
        })

        const confirmBtn = blessed.button({
            parent: buttonBox,
            left: 0,
            content: ' ✓ Commit ',
            style: {
                fg: 'black',
                bg: 'green',
                focus: {
                    fg: 'white',
                    bg: 'blue'
                }
            },
            height: 1,
            width: 12,
            mouse: true,
            keys: true
        })

        const cancelBtn = blessed.button({
            parent: buttonBox,
            right: 0,
            content: ' ✗ Back ',
            style: {
                fg: 'black',
                bg: 'red',
                focus: {
                    fg: 'white',
                    bg: 'blue'
                }
            },
            height: 1,
            width: 10,
            mouse: true,
            keys: true
        })

        // Help text for dialog
        blessed.box({
            parent: dialogBox,
            bottom: 0,
            left: 'center',
            width: 'shrink',
            height: 1,
            content: 'Tab: Switch | Enter: Confirm | Esc: Back',
            style: {
                fg: 'gray'
            }
        })

        confirmBtn.focus()

        // Dialog key handlers
        const closeDialog = () => {
            dialogBox.destroy()
            this.screen.render()
        }

        const confirm = () => {
            this.screen.destroy()
            const fullMessage = hasBody
                ? `${selected.header}\n\n${selected.body}`
                : selected.header

            if (this.resolveMessage) {
                this.resolveMessage({
                    header: selected.header,
                    body: selected.body,
                    fullMessage
                })
            }
        }

        dialogBox.key(['escape'], closeDialog)
        cancelBtn.on('press', closeDialog)
        cancelBtn.key(['enter'], closeDialog)

        confirmBtn.on('press', confirm)
        confirmBtn.key(['enter'], confirm)

        dialogBox.key(['tab'], () => {
            if (this.screen.focused === confirmBtn) {
                cancelBtn.focus()
            } else {
                confirmBtn.focus()
            }
            this.screen.render()
        })

        this.screen.render()
    }

    public showMessages(messages: CommitOption[]): Promise<CommitResult | null> {
        return new Promise((resolve) => {
            this.resolveMessage = resolve
            this.messages = messages
            this.selectedIndex = 0

            // Clear previous elements
            this.radioElements.forEach(el => el.destroy())
            this.radioElements = []

            // Calculate positions and create message boxes
            let currentTop = 0
            const maxWidth = (this.screen.width as number) - 10

            messages.forEach((message, index) => {
                const lines = this.wrapText(message.header, maxWidth)
                const height = lines.length

                const container = blessed.box({
                    parent: this.listBox,
                    top: currentTop,
                    left: 0,
                    right: 0,
                    height: height
                })

                const isSelected = index === this.selectedIndex
                const radioChar = isSelected ? '●' : '○'

                const content = lines.map((line, i) => {
                    if (i === 0) {
                        return `${radioChar} ${line}`
                    }
                    return `  ${line}`
                }).join('\n')

                const textEl = blessed.text({
                    parent: container,
                    top: 0,
                    left: 0,
                    right: 0,
                    height: height,
                    content: content,
                    style: {
                        fg: isSelected ? 'cyan' : 'white'
                    }
                })

                // Click handler
                container.on('click', () => {
                    this.selectedIndex = index
                    this.updateSelection()
                })

                this.radioElements.push(container)
                currentTop += height + 1 // +1 for spacing between items
            })

            this.screen.render()
        })
    }
}

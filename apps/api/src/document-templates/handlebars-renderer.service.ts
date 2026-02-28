import { Injectable, OnModuleInit } from '@nestjs/common'
import * as Handlebars from 'handlebars'

@Injectable()
export class HandlebarsRendererService implements OnModuleInit {
  private handlebars!: typeof Handlebars

  onModuleInit() {
    this.handlebars = Handlebars.create()
    this.registerHelpers()
  }

  private registerHelpers() {
    // {{fallback value "default"}} — backward compat for migrated {{var::fallback}} syntax
    this.handlebars.registerHelper('fallback', (value: unknown, defaultValue: string) => {
      if (value !== undefined && value !== null && value !== '') {
        return value
      }
      return defaultValue
    })

    // {{formatCurrency amount currency}}
    this.handlebars.registerHelper('formatCurrency', (amount: number, currency?: string) => {
      const curr = typeof currency === 'string' ? currency : 'USD'
      const formatted = new Intl.NumberFormat('en-US', {
        style: 'decimal',
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      }).format(amount ?? 0)
      return `${formatted} ${curr}`
    })

    // {{formatDate date "MMM D, YYYY"}}
    this.handlebars.registerHelper('formatDate', (dateStr: string, _format?: string) => {
      if (!dateStr) return ''
      const date = new Date(dateStr)
      if (isNaN(date.getTime())) return dateStr
      return date.toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        timeZone: 'UTC',
      })
    })

    // {{uppercase text}}
    this.handlebars.registerHelper('uppercase', (text: string) => {
      return typeof text === 'string' ? text.toUpperCase() : ''
    })
  }

  render(template: string, context: Record<string, unknown>): string {
    const compiled = this.handlebars.compile(template)
    return compiled(context)
  }

  compile(template: string): (context: Record<string, unknown>) => string {
    return this.handlebars.compile(template)
  }
}

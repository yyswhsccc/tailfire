import { Test, TestingModule } from '@nestjs/testing'
import { HandlebarsRendererService } from '../handlebars-renderer.service'

describe('HandlebarsRendererService', () => {
  let service: HandlebarsRendererService

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [HandlebarsRendererService],
    }).compile()

    service = module.get<HandlebarsRendererService>(HandlebarsRendererService)
    // Trigger lifecycle hook manually since NestJS testing doesn't auto-call it
    service.onModuleInit()
  })

  describe('simple variable substitution', () => {
    it('should replace a single variable', () => {
      const result = service.render('Hello {{name}}!', { name: 'World' })
      expect(result).toBe('Hello World!')
    })

    it('should replace multiple variables', () => {
      const result = service.render('{{greeting}}, {{name}}!', {
        greeting: 'Hi',
        name: 'Alice',
      })
      expect(result).toBe('Hi, Alice!')
    })

    it('should return empty string for missing variables', () => {
      const result = service.render('Hello {{name}}!', {})
      expect(result).toBe('Hello !')
    })
  })

  describe('nested variables', () => {
    it('should resolve nested object paths', () => {
      const result = service.render('Hello {{contact.first_name}} {{contact.last_name}}!', {
        contact: { first_name: 'Jane', last_name: 'Doe' },
      })
      expect(result).toBe('Hello Jane Doe!')
    })

    it('should resolve deeply nested paths', () => {
      const result = service.render('{{a.b.c}}', {
        a: { b: { c: 'deep' } },
      })
      expect(result).toBe('deep')
    })
  })

  describe('HTML escaping', () => {
    it('should escape HTML by default with double braces', () => {
      const result = service.render('{{content}}', {
        content: '<b>bold</b>',
      })
      expect(result).toBe('&lt;b&gt;bold&lt;/b&gt;')
    })

    it('should NOT escape HTML with triple braces', () => {
      const result = service.render('{{{content}}}', {
        content: '<b>bold</b>',
      })
      expect(result).toBe('<b>bold</b>')
    })
  })

  describe('fallback helper', () => {
    it('should return value when present', () => {
      const result = service.render('{{fallback name "Unknown"}}', {
        name: 'Alice',
      })
      expect(result).toBe('Alice')
    })

    it('should return default when value is undefined', () => {
      const result = service.render('{{fallback name "Unknown"}}', {})
      expect(result).toBe('Unknown')
    })

    it('should return default when value is null', () => {
      const result = service.render('{{fallback name "Unknown"}}', {
        name: null,
      })
      expect(result).toBe('Unknown')
    })

    it('should return default when value is empty string', () => {
      const result = service.render('{{fallback name "Unknown"}}', {
        name: '',
      })
      expect(result).toBe('Unknown')
    })

    it('should work with nested paths', () => {
      const result = service.render('{{fallback contact.nickname "Guest"}}', {
        contact: {},
      })
      expect(result).toBe('Guest')
    })

    it('should return value 0 (falsy but valid)', () => {
      const result = service.render('{{fallback count "None"}}', {
        count: 0,
      })
      expect(result).toBe('0')
    })
  })

  describe('formatCurrency helper', () => {
    it('should format amount with explicit currency', () => {
      const result = service.render('{{formatCurrency amount currency}}', {
        amount: 1234.5,
        currency: 'CAD',
      })
      expect(result).toBe('1,234.50 CAD')
    })

    it('should default to USD when currency is not provided', () => {
      const result = service.render('{{formatCurrency amount}}', {
        amount: 99.9,
      })
      expect(result).toBe('99.90 USD')
    })

    it('should handle zero amount', () => {
      const result = service.render('{{formatCurrency amount "EUR"}}', {
        amount: 0,
      })
      expect(result).toBe('0.00 EUR')
    })

    it('should handle null/undefined amount as 0', () => {
      const result = service.render('{{formatCurrency amount "USD"}}', {})
      expect(result).toBe('0.00 USD')
    })

    it('should handle large numbers with commas', () => {
      const result = service.render('{{formatCurrency amount "USD"}}', {
        amount: 1000000,
      })
      expect(result).toBe('1,000,000.00 USD')
    })
  })

  describe('formatDate helper', () => {
    it('should format a valid ISO date string', () => {
      const result = service.render('{{formatDate date}}', {
        date: '2025-06-15T00:00:00Z',
      })
      // toLocaleDateString with month: 'short' gives "Jun 15, 2025"
      expect(result).toBe('Jun 15, 2025')
    })

    it('should format a date-only string', () => {
      const result = service.render('{{formatDate date}}', {
        date: '2025-12-25',
      })
      expect(result).toBe('Dec 25, 2025')
    })

    it('should return empty string for falsy input', () => {
      const result = service.render('{{formatDate date}}', {})
      expect(result).toBe('')
    })

    it('should return original string for invalid date', () => {
      const result = service.render('{{formatDate date}}', {
        date: 'not-a-date',
      })
      expect(result).toBe('not-a-date')
    })
  })

  describe('uppercase helper', () => {
    it('should uppercase a string', () => {
      const result = service.render('{{uppercase text}}', {
        text: 'hello world',
      })
      expect(result).toBe('HELLO WORLD')
    })

    it('should return empty string for non-string input', () => {
      const result = service.render('{{uppercase text}}', {
        text: 123,
      })
      expect(result).toBe('')
    })

    it('should return empty string for undefined', () => {
      const result = service.render('{{uppercase text}}', {})
      expect(result).toBe('')
    })
  })

  describe('built-in #if helper', () => {
    it('should render block when condition is truthy', () => {
      const result = service.render('{{#if showGreeting}}Hello!{{/if}}', {
        showGreeting: true,
      })
      expect(result).toBe('Hello!')
    })

    it('should not render block when condition is falsy', () => {
      const result = service.render('{{#if showGreeting}}Hello!{{/if}}', {
        showGreeting: false,
      })
      expect(result).toBe('')
    })

    it('should render else block when condition is falsy', () => {
      const result = service.render(
        '{{#if showGreeting}}Hello!{{else}}Goodbye!{{/if}}',
        { showGreeting: false },
      )
      expect(result).toBe('Goodbye!')
    })
  })

  describe('built-in #each helper', () => {
    it('should iterate over an array', () => {
      const result = service.render(
        '{{#each items}}{{this}}, {{/each}}',
        { items: ['a', 'b', 'c'] },
      )
      expect(result).toBe('a, b, c, ')
    })

    it('should provide access to object properties in each', () => {
      const result = service.render(
        '{{#each travelers}}{{name}} ({{age}}); {{/each}}',
        {
          travelers: [
            { name: 'Alice', age: 30 },
            { name: 'Bob', age: 25 },
          ],
        },
      )
      expect(result).toBe('Alice (30); Bob (25); ')
    })

    it('should handle empty array', () => {
      const result = service.render(
        '{{#each items}}{{this}}{{/each}}',
        { items: [] },
      )
      expect(result).toBe('')
    })
  })

  describe('compile()', () => {
    it('should return a reusable function', () => {
      const template = service.compile('Hello {{name}}!')
      expect(typeof template).toBe('function')

      const result1 = template({ name: 'Alice' })
      const result2 = template({ name: 'Bob' })
      expect(result1).toBe('Hello Alice!')
      expect(result2).toBe('Hello Bob!')
    })

    it('should work with custom helpers in compiled templates', () => {
      const template = service.compile('{{fallback name "Guest"}} owes {{formatCurrency amount "CAD"}}')
      const result = template({ name: '', amount: 150 })
      expect(result).toBe('Guest owes 150.00 CAD')
    })
  })
})

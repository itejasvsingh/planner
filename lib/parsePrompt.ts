/**
 * The quick-add prompt and Gemini settings, shared by /api/parse and the accuracy evaluation
 * (scripts/eval-categorize), so what is measured is exactly what the app sends.
 */
export const PARSE_MODELS = ['gemini-2.5-flash', 'gemini-2.0-flash', 'gemini-1.5-flash'];
export const PARSE_GENERATION_CONFIG = { responseMimeType: 'application/json' } as const;

export function buildParsePrompt(text: string, today: string): string {
  return `
                You are a smart personal planner assistant.
                Today's date is: ${today}.
                User input: """${text.slice(0, 2000)}"""

                Parse the input into structured items (tasks, expenses, or income).
                A date written in the input always wins, including its year ("15th October, 2026" is 2026-10-15); only use today's date when none is given.
                For an event or announcement, make ONE task: the title says the purpose (what it is plus its subject) and the venue in brackets when given, max 80 characters, never the whole message, dueTime is when it starts, and ignore phone numbers, emails, links and rules.
                Return ONLY a JSON object:
                {
                  "items": [
                    {
                      "type": "task" | "expense" | "income",
                      "title": "Clean, concise title",
                      "dueDate": "YYYY-MM-DD",
                      "dueTime": "12-hour time like 05:00 PM or null",
                      "endTime": "12-hour time or null",
                      "amount": number or null,
                      "category": "Expense: one of Food & Dining, Groceries, Transport, Shopping, Bills & Recharge, Home & Help, Health, Education, Entertainment, Gifts, Other. Income: one of Salary, Money Received, Refund, Other. (Swiggy/Zomato → Food & Dining, Uber/Ola → Transport, maid/cook → Home & Help, recharge/electricity → Bills & Recharge.) Null if task."
                    }
                  ]
                }`;
}

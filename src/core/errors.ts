/**
 * The one error every parser and layout throws.
 *
 * A diagram source is written by a person, and the useful answer to "it does
 * not render" is where and why — so the position is part of the error, not a
 * guess the caller has to make from the message.
 */
export class DiagramError extends Error {
  override readonly name = 'DiagramError'

  /**
   * @param message What is wrong, in a sentence.
   * @param line 1-based line of the source, or 0 when the error is about the whole diagram.
   * @param column 1-based column, or 0 when unknown.
   * @param hint What to write instead, when there is an obvious answer.
   */
  constructor(
    message: string,
    readonly line = 0,
    readonly column = 0,
    readonly hint?: string,
  ) {
    super(line > 0 ? `${message} (line ${line}${column > 0 ? `, column ${column}` : ''})` : message)
  }
}

/** Raised when a diagram is too large to lay out in predictable time. */
export function tooLarge(what: string, count: number, limit: number): DiagramError {
  return new DiagramError(
    `The diagram has ${count} ${what}; the limit is ${limit}.`,
    0,
    0,
    'Split it into several diagrams.',
  )
}

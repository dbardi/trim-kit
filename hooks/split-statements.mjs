const SEPARATORS = new Set([';', '&', '|', '\n', '(', ')', '{', '}']);
const QUOTES = new Set(['"', "'"]);
const WHITESPACE = /\s/;

// Splits a command on shell separators outside quotes and returns each statement as its list of words.
export function splitStatements(command) {
  return new StatementSplitter(command).split();
}

class StatementSplitter {
  #command;
  #statements = [[]];
  #word;
  #quote;

  constructor(command) {
    this.#command = command;
  }

  split() {
    for (let index = 0; index < this.#command.length; index += 1) {
      this.#read(index);
    }
    this.#endWord();
    return this.#statements.filter((words) => words.length > 0);
  }

  #read(index) {
    const character = this.#command[index];
    if (this.#quote) {
      this.#readQuoted(character);
    } else if (QUOTES.has(character)) {
      this.#quote = character;
      this.#word ??= '';
    } else if (this.#separatesAt(index)) {
      this.#endWord();
      this.#statements.push([]);
    } else if (WHITESPACE.test(character)) {
      this.#endWord();
    } else {
      this.#word = (this.#word ?? '') + character;
    }
  }

  #readQuoted(character) {
    if (character === this.#quote) {
      this.#quote = undefined;
    } else {
      this.#word += character;
    }
  }

  // The & in 2>&1, >&2 and &> belongs to a redirect.
  #separatesAt(index) {
    const command = this.#command;
    const isRedirectAmpersand = command[index] === '&' && (command[index - 1] === '>' || command[index + 1] === '>');
    return SEPARATORS.has(command[index]) && !isRedirectAmpersand;
  }

  #endWord() {
    if (this.#word !== undefined) {
      this.#statements.at(-1).push(this.#word);
      this.#word = undefined;
    }
  }
}

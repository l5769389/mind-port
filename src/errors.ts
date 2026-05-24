export class MindPortError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MindPortError";
  }
}

export class UnsupportedFormatError extends MindPortError {
  constructor(message: string) {
    super(message);
    this.name = "UnsupportedFormatError";
  }
}

export class ParseMindError extends MindPortError {
  constructor(message: string, public readonly cause?: unknown) {
    super(message);
    this.name = "ParseMindError";
  }
}

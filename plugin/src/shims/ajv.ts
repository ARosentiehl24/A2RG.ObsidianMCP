export default class AjvBuildShim {
  constructor(_options?: unknown) {}

  compile(_schema: unknown): never {
    throw new Error("Ajv dynamic validation is disabled");
  }

  getSchema(_id: string): undefined {
    return undefined;
  }

  errorsText(_errors?: unknown): string {
    return "Schema validation unavailable";
  }
}

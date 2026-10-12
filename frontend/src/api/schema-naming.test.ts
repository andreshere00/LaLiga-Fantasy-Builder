// ---- Mocks, fixtures & helpers ---- //

import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";

import ts from "typescript";
import { describe, expect, it } from "vitest";

function schemaSources(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const file = resolve(directory, entry.name);
    if (entry.isDirectory()) return schemaSources(file);
    return /\.tsx?$/.test(file) && !/\.test\./.test(file)
      && /from ["']zod["']/.test(readFileSync(file, "utf8")) ? [file] : [];
  });
}
const schemaFiles = schemaSources(resolve(process.cwd(), "src"));
const camelCase = /^[a-z][A-Za-z0-9]*$/;

function schemaDeclarations(sourceText: string, fileName: string) {
  const source = ts.createSourceFile(fileName, sourceText, ts.ScriptTarget.Latest, true);
  const propertyNames: string[] = [];
  const schemaNames: string[] = [];

  const objectDeclarations = new Map<string, ts.ObjectLiteralExpression>();
  function gather(node: ts.Node): void {
    if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.initializer
      && ts.isObjectLiteralExpression(node.initializer)) {
      objectDeclarations.set(node.name.text, node.initializer);
    }
    ts.forEachChild(node, gather);
  }
  gather(source);
  function propertiesOf(expression: ts.Expression, seen = new Set<string>()): string[] {
    if (ts.isIdentifier(expression)) {
      if (seen.has(expression.text)) return [];
      seen.add(expression.text);
      const object = objectDeclarations.get(expression.text);
      return object ? propertiesOf(object, seen) : [];
    }
    if (!ts.isObjectLiteralExpression(expression)) return [];
    return expression.properties.flatMap((property) => {
      if (ts.isSpreadAssignment(property)) return propertiesOf(property.expression, seen);
      if (ts.isPropertyAssignment(property) && (ts.isIdentifier(property.name) || ts.isStringLiteral(property.name))) {
        return [property.name.text];
      }
      return [];
    });
  }

  function visit(node: ts.Node): void {
    if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name)) {
      if (node.name.text.endsWith("Schema")) schemaNames.push(node.name.text);
    }

    if (
      ts.isCallExpression(node) &&
      node.arguments.length > 0 &&
      ((ts.isIdentifier(node.expression) && node.expression.text === "readObject") ||
        (ts.isPropertyAccessExpression(node.expression) &&
          node.expression.expression.getText(source) === "z" &&
          ["object", "strictObject", "looseObject"].includes(node.expression.name.text)))
    ) {
      propertyNames.push(...propertiesOf(node.arguments[0]));
    }

    ts.forEachChild(node, visit);
  }

  visit(source);
  return { propertyNames, schemaNames };
}

// ---- Happy path ---- //

describe("Zod naming conventions", () => {
  it("declared_schema_names_and_properties_are_camel_case", () => {
    const properties: string[] = [];
    const schemaNames: string[] = [];

    for (const file of schemaFiles) {
      const source = readFileSync(resolve(process.cwd(), file), "utf8");
      const declarations = schemaDeclarations(source, file);
      properties.push(...declarations.propertyNames);
      schemaNames.push(...declarations.schemaNames);
    }

    expect(properties.length).toBeGreaterThan(0);
    expect(schemaNames.length).toBeGreaterThan(0);
    expect(properties.filter((name) => !camelCase.test(name))).toEqual([]);
    expect(schemaNames.filter((name) => !camelCase.test(name))).toEqual([]);
  });
});

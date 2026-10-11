import { readFile } from 'node:fs/promises';
import { URL } from 'node:url';
import ts from 'typescript';

export async function resolve(specifier, context, next) {
  if (
    context.parentURL?.endsWith('.ts') &&
    specifier.startsWith('.') &&
    !/\.[a-z]+$/i.test(specifier)
  )
    specifier += '.ts';
  return next(specifier, context);
}

export async function load(url, context, next) {
  if (!url.endsWith('.ts')) return next(url, context);
  const source = await readFile(new URL(url), 'utf8');
  return {
    format: 'module',
    shortCircuit: true,
    source: ts.transpileModule(source, {
      compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext },
    }).outputText,
  };
}

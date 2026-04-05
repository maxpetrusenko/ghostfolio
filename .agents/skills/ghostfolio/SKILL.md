```markdown
# ghostfolio Development Patterns

> Auto-generated skill from repository analysis

## Overview
This skill teaches the core development patterns and conventions used in the `ghostfolio` TypeScript codebase. It covers file organization, import/export styles, commit message patterns, and testing approaches. By following these guidelines, contributors can write code that is consistent with the project's established practices.

## Coding Conventions

### File Naming
- Use **camelCase** for file names.
  - Example: `portfolioManager.ts`, `userSettings.ts`

### Import Style
- Use **relative imports** for referencing local modules.
  - Example:
    ```typescript
    import { calculateReturns } from './utils';
    ```

### Export Style
- Use **named exports** rather than default exports.
  - Example:
    ```typescript
    // In utils.ts
    export function calculateReturns() { ... }

    // In another file
    import { calculateReturns } from './utils';
    ```

### Commit Message Patterns
- Commit messages are **freeform** with no enforced prefix.
- Average commit message length is short (~14 characters).
  - Example: `fix typo`, `add tests`, `update config`

## Workflows

### Adding a New Feature
**Trigger:** When implementing a new feature or module  
**Command:** `/add-feature`

1. Create a new file using camelCase naming.
2. Write your code using named exports.
3. Use relative imports for dependencies.
4. Add or update corresponding test files (`*.test.*`).
5. Commit your changes with a concise message.
6. Open a pull request for review.

### Refactoring Code
**Trigger:** When improving or restructuring existing code  
**Command:** `/refactor-code`

1. Identify the code to refactor.
2. Update file names to camelCase if needed.
3. Ensure all imports are relative and exports are named.
4. Run or update tests to confirm behavior.
5. Commit with a brief, descriptive message.
6. Submit changes for review.

### Writing Tests
**Trigger:** When adding or updating tests  
**Command:** `/write-test`

1. Create or update test files using the `*.test.*` pattern.
2. Write tests for all new or changed functionality.
3. Use the project's standard testing framework (framework is currently unknown).
4. Run tests to verify correctness.
5. Commit test changes with a clear message.

## Testing Patterns

- Test files follow the `*.test.*` naming convention (e.g., `portfolioManager.test.ts`).
- The specific testing framework is not detected, but standard TypeScript test syntax applies.
- Tests should cover all new and modified code.

  Example:
  ```typescript
  // portfolioManager.test.ts
  import { calculateReturns } from './portfolioManager';

  test('calculateReturns returns correct value', () => {
    expect(calculateReturns([100, 110])).toBe(10);
  });
  ```

## Commands
| Command        | Purpose                                |
|----------------|----------------------------------------|
| /add-feature   | Start the process to add a new feature |
| /refactor-code | Begin a code refactor workflow         |
| /write-test    | Add or update tests for your code      |
```

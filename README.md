# reccli-ts

`reccli-ts` is a command-line interface (CLI) for the **Rec Cloud Service**, re-implemented in **TypeScript**. It is a modernized version of the original [reccli](https://github.com/taoky/reccli) project, which was originally written in Python.

## Features

- **TypeScript Implementation**: The original Python code has been re-written in TypeScript for better performance, type safety, and compatibility with modern JavaScript/TypeScript environments.
- **Group Cloud Drive Access**: Added support for managing group-based cloud drive access, allowing users to access and interact with cloud resources at the group level.
- **Modular and Extensible**: The project is designed with a modular architecture, making it easy to extend and customize with new features as needed.

## Installation

### Step 1: Clone the repository

```bash
git clone https://github.com/Vertsineu/reccli-ts.git
cd reccli-ts
```

### Step 2: Install dependencies

```bash
npm install
```

### Step 3: Build the project

```bash
npm run build
```

### Step 4: Run the CLI

```bash
npm run start
```

Alternatively, if you want to use Bun to generate the binary package, follow these steps:

+ Install Bun if you haven't already:

```bash
npm install -g bun
```

+ Build the project:

```bash
bun build --compile --minify --sourcemap ./src/index.ts --outfile reccli-ts
```

Then you can run the CLI with:

```bash
./reccli-ts
```

## Usage

### `login` Command

Log in to the Rec Cloud Service using your student ID and password:

```bash
reccli-ts login
```

You will be prompted to enter your student ID and password.

### `run` Command

Once logged in, you can run the CLI with:

```bash
reccli-ts run
```

This command will execute the main functionality of the Rec Cloud Service CLI.

You can view the original `reccli` repository [here](https://github.com/taoky/reccli).

## Acknowledgements

This project is based on the open-source library [reccli](https://github.com/taoky/reccli), which is licensed under the MIT License. The original repository provides a command-line interface for Rec Cloud Service.

### Modifications

The following modifications were made to the original project:

- The original Python implementation has been re-written in TypeScript for better integration with modern JavaScript/TypeScript environments.
- Added new functionality for **group cloud drive access**, allowing users to manage group-based operations in addition to individual account functionalities.

## License

This project continues to be licensed under the MIT License, and the original MIT License terms from the `reccli` project apply to the original codebase.

# Contributing

## Setup

This project uses:watch

- [pre-commit](https://pre-commit.com/) to manage git hooks
- [mozilla/web-ext](https://github.com/mozilla/web-ext) to run the local demo extension

Install the global tools:

```sh
npm install --global web-ext
brew install pre-commit # Or the equivalent for your OS
```

Ready the project:

```sh
npm install
pre-commit install
```

## Build

To run TypeScript on the library:

```sh
npm run watch
```

To run the linter, with autofix:

```sh
npm run fix
```

## Testing

Testing is semi-manual. To run the tests, build the extension with:

```sh
npm run demo:watch
```

Then open it in the browser with:

```Sh
web-ext run
```

and then open the console. You might need to refresh the page once.

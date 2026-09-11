# Contributing

Contributions are welcome.

## Before You Start

Open an issue first to discuss what you'd like to change. That avoids work on
something that turns out to be out of scope, and it's the fastest way to agree
on an approach.

## Development Setup

Clone the repo. There is nothing to install: the project has no dependencies at
all, production or dev — it runs on Node.js >= 18 built-ins and the test runner
built into Node.

The commands for running the suites are in the README's
[Run it yourself](README.md#run-it-yourself) section.

The website (anotifier.io) is the one exception: its source is in `landing/`
and has its own `package.json`. See the README's [Website](README.md#website)
section for how to run and check it. Site facts (commands, config keys,
defaults) must match this package exactly — the Honesty Rule below applies to
`landing/lib/docs.ts` as much as to the README.

## Before Opening a Pull Request

Run the unit suite — it's offline and fast:

```bash
npm test
```

It must pass. If you changed platform behavior, say which platform you actually
exercised it on; CI runs Linux, macOS, and Windows.

## The Honesty Rule

Documentation claims must match what the code does, exactly. If a feature is
unit-tested but not proven end to end, the docs say so — see the proof
boundaries called out in the README's Testing section. Please don't add a claim
a reader could check and find overstated, and if you change behavior that the
README describes, update the README in the same PR.

## Reporting Security Issues

Don't open a public issue — see [SECURITY.md](SECURITY.md).

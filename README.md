## Monorepo: public-api, market-data-simulator, @krupton/interface, @krupton/config

### Install

```bash
corepack enable
corepack prepare pnpm@9.12.2 --activate
pnpm install
```

### Develop

```bash
pnpm dev
```

### Build

```bash
pnpm build
```

### Start servers

```bash
pnpm --filter public-api start
pnpm --filter market-data-simulator start
```



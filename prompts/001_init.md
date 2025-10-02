initialize repository a pnpm repository with two apps and 1 package

### pnpm workspaces
1. app public-api nodejs typescript server
2. app public-api-mock-client
  * sends test data through websockets and rest API to public-api mimic real cyptocurrencies backpressure of trades and offers
3. package interface
* rest and websockets API contracts... public-api uses to validate incoming request bodies and outgoing response bodies while public-api-mock-client uses the interfaces to validate outgoing request bodies

### build requirements
* tsup, prettier, eslint, vitest 
* shared prettier, eslint, tsconfig, tsup confiogurations (can be through package)
* do not use any monorepo managers like turbo, just use pnpm...
* build of interface/configs updates apps node_modules/cache
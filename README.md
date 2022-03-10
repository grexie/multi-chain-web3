# Grexie Multi-chain Web3

This package provides a subclass of Web3 offering multi-chain support. It provides a BatchRequest class that can be used server side to reduce the number of individual calls made to the Web3 RPC endpoint. The BatchRequest class in use aggregates calls across multiple usages of the Web3 client.

It also provides an easy way to manage Web3 instances across multiple chains, by providing a chain configuration and caching web3 instances for each chain.

## Installing

```bash
yarn add @grexie/multi-chain-web3
```

## Usage

Instantiate a new instance globally of the Web3 subclass:

```typescript
import { Web3 } from '@grexie/multi-chain-web3';

const web3 = new Web3();

export { web3 };
```

The Web3 instance created is a full-fledged Web3 subclass without a provider associated with it. You can call methods on `web3.utils`, etc without having to establish a chained-instance of Web3.

To get a web3 instance for a particular chain:

```typescript
const mainnetWeb3 = web3.forChain('ethereum-mainnet');
const rinkebyWeb3 = web3.forChain('ethereum-rinkeby');
...
```

You can interrogate the chain configuration using the following functions:

```typescript
import { Chain, ChainType } from '@grexie/multi-chain-web3';

const mainnetChain: Chain<ChainType.mainnet> =
  web3.getChain('ethereum-mainnet');
const ethereumTestnets = mainnetChain.testnets;
```

Or get all mainnets:

```typescript
import { ChainType } from '@grexie/multi-chain-web3';

const mainnetChains = web3.getChainsOfType(ChainType.mainnet);
const testnetChains = web3.getChainsOfType(ChainType.testnet);
const localnetChains = web3.getChainsOfType(ChainType.localnet);
```

The default configuration has many chains built-in, but you can pass a custom configuration as follows:

```typescript
import { Web3 } from '@grexie/multi-chain-web3';
import chains from './chains.json';

const web3 = new Web3(chains);
```

The aggregated batch request manager will issue a batch request to the RPC endpoint at the end of each event loop, or sooner if it reaches a default threshold of 500 requests. To configure the maximum number of requests to allow in the aggregated batch request manager:

```typescript
import { Web3 } from '@grexie/multi-chain-web3';

const web3 = new Web3(undefined, 250);
```

To issue a request to the batch request manager, use it just as you would with the built-in `web3.BatchRequest`:

```typescript
const mainnet = web3.forChain('ethereum-mainnet');
const batch = new mainnet.BatchRequest();
const promise = new Promise((resolve, reject) => {
  batch.add(
    mainnet.eth.getBalance.request(
      address,
      (err,
      value => {
        if (err) {
          reject(err);
          return;
        }

        resolve(value);
      })
    )
  );
});
batch.execute();
const value = await promise;
```

The default chain configuration looks for RPC URLs in environment variables. To do the same in a custom configuration specify `env:ENV_VAR` as the value for `url` for each chain, or `url.http` and `url.ws` for specifying WebSocket URLs as well.

The env vars you should configure for the default configuration are:

- `WEB3_ETHEREUM_MAINNET_URL`: id ethereum-mainnet
- `WEB3_ETHEREUM_GOERLI_URL`: id ethereum-goerli
- `WEB3_ETHEREUM_KOVAN_URL`: id ethereum-kovan
- `WEB3_ETHEREUM_RINKEBY_URL`: id ethereum-rinkeby
- `WEB3_ETHEREUM_ROPSTEN_URL`: id ethereum-ropsten
- `WEB3_POLYGON_MAINNET_URL`: id polygon-mainnet
- `WEB3_POLYGON_MUMBAI_URL`: id polygon-mumbai
- `WEB3_BSC_MAINNET_URL`: id bsc-mainnet
- `WEB3_BSC_CHAPEL_URL`: id bsc-chapel
- `WEB3_LOCAL_URL`: id local

The chains available will be a subset of these depending on whether the environment variable is configured or not. If you try to get a chain that isn't available, an error will be thrown.

If you want to add more chains to the default chain configuration provided, and you'd like these to be in the NPM package, please edit `src/chains.json` and submit a pull request.

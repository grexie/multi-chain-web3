import defaultChains from './chains.json';
import NativeWeb3 from 'web3';
import { Method as Web3Method } from 'web3-core-method';

export enum ChainType {
  mainnet = 'mainnet',
  testnet = 'testnet',
  localnet = 'localnet',
}

export enum ConnectionType {
  HTTP,
  WebSockets,
}

export interface Currency {
  name: string;
  symbol: string;
  decimals: number;
}

interface ChainBase<T extends ChainType = ChainType> {
  id: string;
  chainId: number;
  type: T;
  url: {
    http?: string;
    ws?: string;
  };
  currency: Currency;
}

export type Chain<T extends ChainType = ChainType> = ChainBase<T> &
  (T extends ChainType.mainnet
    ? {
        testnets: Chain[];
        localnets: Chain[];
      }
    : T extends ChainType.testnet
    ? {
        mainnet: Chain;
      }
    : {});

export type ChainConfig<T extends ChainType = ChainType> = ChainBase<T> & {
  url: Chain['url'] | string;
} & (T extends ChainType.testnet
    ? {
        mainnet: string;
      }
    : {});

class BatchRequestQueue {
  #BatchRequest: NativeWeb3['BatchRequest'];
  #immediate: NodeJS.Immediate;
  #queue: Web3Method[] = [];
  readonly #maxBatchSize: number;

  constructor(BatchRequest: NativeWeb3['BatchRequest'], maxBatchSize: number) {
    this.#BatchRequest = BatchRequest;
    this.#maxBatchSize = maxBatchSize;
  }

  #process() {
    clearImmediate(this.#immediate);
    const handler = () => {
      const requests = this.#queue.splice(0, this.#queue.length);
      console.info('executing', requests.length, 'web3 requests');
      const batch = new this.#BatchRequest();
      for (const request of requests) {
        batch.add(request);
      }
      batch.execute();
    };

    if (this.#queue.length >= this.#maxBatchSize) {
      handler();
    } else {
      this.#immediate = setImmediate(handler);
    }
  }

  execute(requests: Web3Method[]) {
    this.#queue.push(...requests);
    this.#process();
  }
}

const createQueueAwareBatchRequestClass = (queue: BatchRequestQueue) => {
  return class QueueAwareBatchRequest {
    #requests: Web3Method[] = [];

    add(request: Web3Method) {
      this.#requests.push(request);
      return request;
    }

    execute() {
      queue.execute(this.#requests.splice(0, this.#requests.length));
    }
  };
};

class ChainWeb3 extends NativeWeb3 {
  chain: Chain;
}

class Web3 extends NativeWeb3 {
  readonly #maxBatchSize: number;
  readonly #chains: {
    [id: string | number]: Chain;
  } = {};
  readonly #clients: {
    http: {
      [id: string]: ChainWeb3;
    };
    ws: {
      [id: string]: ChainWeb3;
    };
  } = {
    http: {},
    ws: {},
  };

  constructor(chains?: ChainConfig[] | null, maxBatchSize: number = 500) {
    super();

    this.#maxBatchSize = maxBatchSize;

    if (!chains) {
      chains = defaultChains as ChainConfig[];
    }

    for (let chain of chains) {
      chain = { ...chain, currency: { ...chain.currency } };
      let url: {
        http?: string;
        ws?: string;
      };

      if (typeof chain.url === 'string') {
        if (chain.url.startsWith('env:')) {
          url = {
            http: process.env[chain.url.substring(4)],
          };
        } else {
          url = {
            http: chain.url,
          };
        }
      } else {
        url = {};

        if (typeof chain.url.http === 'string') {
          if (chain.url.http.startsWith('env:')) {
            url.http = process.env[chain.url.http.substring(4)];
          } else {
            url.http = chain.url.http;
          }
        }

        if (typeof chain.url.ws === 'string') {
          if (chain.url.ws.startsWith('env:')) {
            url.ws = process.env[chain.url.ws.substring(4)];
          } else {
            url.ws = chain.url.ws;
          }
        }
      }

      if (!url.http && !url.ws) {
        continue;
      }

      this.#chains[chain.id] = chain;
    }

    for (const chain of Object.values(this.#chains)) {
      this.#chains[chain.chainId] = chain;

      if (chain.type === ChainType.mainnet) {
        (chain as Chain<ChainType.mainnet>).testnets = chains
          .filter(
            c =>
              c.type == ChainType.testnet &&
              (c as ChainConfig<ChainType.testnet>).mainnet === chain.id
          )
          .map(c => {
            try {
              return this.getChain(c.id);
            } catch (err) {
              return null;
            }
          })
          .filter(x => !!x)
          .map(x => x!);
        (chain as Chain<ChainType.mainnet>).localnets =
          chains
            .filter(c => c.type == ChainType.localnet)
            ?.map(c => {
              try {
                return this.getChain(c.id);
              } catch (err) {
                return null;
              }
            })
            .filter(x => !!x)
            .map(x => x!) ?? [];
      } else if (chain.type === ChainType.testnet) {
        const mainnet = chains.find(c => c.id === chain.id);
        if (mainnet) {
          (chain as Chain<ChainType.testnet>).mainnet = this.getChain(mainnet);
        }
      }
    }
  }

  getChain(chain: Chain | string | number): Chain {
    if (typeof chain === 'string' || typeof chain === 'number') {
      if (!this.#chains[chain]) {
        throw new Error(`chain ${chain} not found`);
      }

      chain = this.#chains[chain];
    }

    return chain;
  }

  getChainsOfType(type: ChainType): Chain[] {
    return Array.from(
      new Set(
        Object.values(this.#chains)
          .filter(chain => chain.type === type)
          .map(chain => chain.id)
      )
    ).map(id => this.getChain(id));
  }

  forChain(
    chain: Chain | string | number,
    type: ConnectionType = ConnectionType.HTTP
  ) {
    chain = this.getChain(chain);
    let cache: { [id: string]: ChainWeb3 };
    let provider: any;

    if (type === ConnectionType.HTTP && chain.url.http) {
      cache = this.#clients.http;
      provider = new Web3.providers.HttpProvider(chain.url.http);
    } else if (type === ConnectionType.WebSockets && chain.url.ws) {
      cache = this.#clients.ws;
      provider = new Web3.providers.WebsocketProvider(chain.url.ws);
    } else {
      throw new Error(`unable to resolve rpc url for ${chain.id}`);
    }

    if (!cache[chain.id]) {
      const web3 = new ChainWeb3(provider);
      const queue = new BatchRequestQueue(
        web3.BatchRequest,
        this.#maxBatchSize
      );
      web3.BatchRequest = createQueueAwareBatchRequestClass(queue);
      web3.chain = chain;

      cache[chain.id] = web3;
    }

    return cache[chain.id];
  }
}

export { Web3 };

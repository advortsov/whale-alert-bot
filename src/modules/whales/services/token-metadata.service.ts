import { Injectable } from '@nestjs/common';

import { EthereumTokenMetadataAdapter } from '../../chains/ethereum/ethereum-token-metadata.adapter';

@Injectable()
export class TokenMetadataService extends EthereumTokenMetadataAdapter {}

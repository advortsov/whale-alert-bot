import { Injectable } from '@nestjs/common';

import { EthereumTokenMetadataAdapter } from '../modules/chains/ethereum/ethereum-token-metadata.adapter';

@Injectable()
export class TokenMetadataService extends EthereumTokenMetadataAdapter {}

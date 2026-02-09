import { Injectable } from '@nestjs/common';

import { EthereumTokenMetadataAdapter } from '../integrations/token-metadata/ethereum/ethereum-token-metadata.adapter';

@Injectable()
export class TokenMetadataService extends EthereumTokenMetadataAdapter {}

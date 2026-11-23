import { Module } from '@nestjs/common';
import { SheltersController } from './shelters.controller';
@Module({ controllers: [SheltersController] })
export class SheltersModule {}

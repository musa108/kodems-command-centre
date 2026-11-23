import { Module } from '@nestjs/common';
import { AdminController } from './admin.controller';
import { StorageService } from '../common/storage.service';
@Module({ controllers: [AdminController], providers: [StorageService] })
export class AdminModule {}

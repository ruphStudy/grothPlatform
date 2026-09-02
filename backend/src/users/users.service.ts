import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { User, UserDocument } from './schemas/user.schema';

@Injectable()
export class UsersService {
  constructor(@InjectModel(User.name) private userModel: Model<UserDocument>) {}

  create(data: { name: string; email: string; passwordHash: string }) {
    return new this.userModel(data).save();
  }

  findByEmail(email: string) {
    return this.userModel.findOne({ email }).exec();
  }

  findById(id: string) {
    return this.userModel.findById(id).exec();
  }

  toSafeUser(user: UserDocument) {
    return {
      id: user._id,
      name: user.name,
      email: user.email,
      status: user.status,
      createdAt: (user as any).createdAt,
      updatedAt: (user as any).updatedAt,
    };
  }
}

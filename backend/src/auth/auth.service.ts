import { BadRequestException, ConflictException, Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { LegalAcceptanceService } from '../launch/launch.service';
import { UsersService } from '../users/users.service';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';

const SALT_ROUNDS = 10;

@Injectable()
export class AuthService {
  constructor(
    private readonly usersService: UsersService,
    private readonly jwtService: JwtService,
    private readonly legalAcceptance: LegalAcceptanceService,
  ) {}

  private signToken(userId: string, email: string) {
    return this.jwtService.sign({ sub: userId, email });
  }

  async register(dto: RegisterDto, meta: { ip?: string; userAgent?: string } = {}) {
    if (!dto.termsAccepted) throw new BadRequestException('legal_acceptance_required');
    if (dto.confirmPassword !== undefined && dto.confirmPassword !== dto.password) throw new BadRequestException('password_confirmation_mismatch');
    const email = dto.email.toLowerCase();
    const existing = await this.usersService.findByEmail(email);
    if (existing) {
      throw new ConflictException('Email is already registered');
    }

    const passwordHash = await bcrypt.hash(dto.password, SALT_ROUNDS);
    const name = dto.name || [dto.firstName, dto.lastName].filter(Boolean).join(' ').trim();
    const user = await this.usersService.create({ name, email, passwordHash });
    await this.legalAcceptance.recordSignupAcceptance({ userId: String(user._id), termsVersion: dto.termsVersion, privacyVersion: dto.privacyVersion, ip: meta.ip, userAgent: meta.userAgent });

    return {
      user: this.usersService.toSafeUser(user),
      accessToken: this.signToken(String(user._id), user.email),
    };
  }

  async login(dto: LoginDto) {
    const email = dto.email.toLowerCase();
    const user = await this.usersService.findByEmail(email);
    if (!user) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const passwordMatches = await bcrypt.compare(dto.password, user.passwordHash);
    if (!passwordMatches) {
      throw new UnauthorizedException('Invalid credentials');
    }

    return {
      user: this.usersService.toSafeUser(user),
      accessToken: this.signToken(String(user._id), user.email),
    };
  }

  async getProfile(userId: string) {
    const user = await this.usersService.findById(userId);
    if (!user) {
      throw new UnauthorizedException();
    }
    return this.usersService.toSafeUser(user);
  }
}

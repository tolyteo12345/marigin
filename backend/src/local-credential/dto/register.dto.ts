import { IsEmail, IsString, MinLength } from 'class-validator';

// BR-015 resolved: minimum 8 characters, no forced complexity (NIST 800-63B).
export class RegisterDto {
  @IsEmail()
  email!: string;

  @IsString()
  @MinLength(8)
  password!: string;
}

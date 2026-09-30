import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class CreateConnectionDto {
  @ApiProperty({ example: 'Tài khoản chính' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  label!: string;

  // Not @IsEmail-style format-checked: Binance API keys/secrets have no
  // publicly documented fixed format beyond "opaque string" — validating a
  // shape we don't actually know would risk rejecting valid keys.
  @ApiProperty({ example: 'Vs9...redacted...' })
  @IsString()
  @IsNotEmpty()
  apiKey!: string;

  @ApiProperty({ example: 'NhQ...redacted...' })
  @IsString()
  @IsNotEmpty()
  apiSecret!: string;
}

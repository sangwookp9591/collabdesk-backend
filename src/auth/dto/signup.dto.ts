import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsNotEmpty, MinLength } from 'class-validator';

export class SignupDto {
  @ApiProperty({ example: 'test@example.com', description: '이메일' })
  @IsEmail({}, { message: '올바른 이메일 형식이 아닙니다.' })
  email: string;

  @ApiProperty({ example: '홍길동', description: '사용자 이름' })
  @IsNotEmpty({ message: '이름은 필수입니다.' })
  name: string;

  @ApiProperty({ example: '12345678', description: '비밀번호' })
  @IsNotEmpty({ message: '비밀번호는 필수입니다.' })
  @MinLength(6, { message: '비밀번호는 최소 6자리 이상이어야 합니다.' })
  password: string;

  @ApiProperty({ example: '12345678', description: '비밀번호 확인' })
  @IsNotEmpty({ message: '비밀번호 확인은 필수입니다.' })
  confirmPassword: string;
}

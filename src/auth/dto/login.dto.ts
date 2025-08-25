import { IsEmail, IsNotEmpty, IsString } from 'class-validator';

export class LoginDto {
  @IsEmail()
  @IsNotEmpty({ message: '이메일은 필수입니다.' })
  email: string;

  @IsString()
  @IsNotEmpty({ message: '비밀번호는 필수입니다.' })
  password: string;
}

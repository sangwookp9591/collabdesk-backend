export class AuthResponseDto {
  id: string;
  email: string;
  name: string;
  profileImageUrl?: string;
  status: string;
  createdAt: Date;
  updatedAt: Date;
}

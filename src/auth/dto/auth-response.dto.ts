export class AuthResponseDto {
  user: {
    id: string;
    email: string;
    name: string;
    profileImageUrl?: string;
    status: string;
    createdAt: Date;
    updatedAt: Date;
  };
  accessToken?: string;
  refreshToken?: string;
  expiresIn?: number;
}

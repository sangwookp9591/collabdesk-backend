// supabase.service.ts
import { Injectable } from '@nestjs/common';
import { createClient, SupabaseClient } from '@supabase/supabase-js';

@Injectable()
export class SupabaseService {
  private supabase: SupabaseClient;

  constructor() {
    this.supabase = createClient(
      process.env.SUPABASE_URL!,
      process.env.SUPABASE_ANON_KEY!,
    );
  }

  async uploadProfileImage(
    file: Express.Multer.File,
    userId: string,
  ): Promise<{ url: string; path: string }> {
    const fileExt = file.originalname.split('.').pop();
    const fileName = `${userId}-profile-${Date.now()}.${fileExt}`;
    const filePath = `profiles/${fileName}`;

    const { data, error } = await this.supabase.storage
      .from('avatars')
      .upload(filePath, file.buffer, {
        contentType: file.mimetype,
        upsert: true,
      });

    console.log('data : ', data);
    if (error) {
      throw new Error(`Profile image upload failed: ${error.message}`);
    }

    const { data: urlData } = this.supabase.storage
      .from('avatars')
      .getPublicUrl(filePath);

    return {
      url: urlData.publicUrl,
      path: filePath,
    };
  }

  async deleteImage(path: string): Promise<void> {
    if (!path) return;

    const { error } = await this.supabase.storage
      .from('avatars')
      .remove([path]);

    if (error) {
      console.error(`Failed to delete image: ${error.message}`);
    }
  }
}

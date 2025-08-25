type GenerateImagePathType = {
  file: Express.Multer.File;
  type: 'profile' | 'workspace' | 'channel';
  key: string;
};

export const generateImagePath = ({
  file,
  type,
  key,
}: GenerateImagePathType) => {
  const fileExt = file.originalname.split('.').pop();
  const fileName = `${key}-${type}-${Date.now()}.${fileExt}`;
  const filePath = `${type}s/${fileName}`;

  return filePath;
};

import { S3Client, PutObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

const s3Client = new S3Client({
    region: process.env.AWS_REGION!,
    credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
    },
});

export const uploadFileToS3 = async (file: Buffer, fileName: string, contentType: string) => {
    const bucketName = process.env.AWS_S3_BUCKET_NAME!;
    const key = `patients/${Date.now()}-${fileName}`;

    const command = new PutObjectCommand({
        Bucket: bucketName,
        Key: key,
        Body: file,
        ContentType: contentType,
    });

    await s3Client.send(command);

    return key; // We store the key, and get signed URLs when needed
};

export const getSignedFileUrl = async (key: string) => {
    const bucketName = process.env.AWS_S3_BUCKET_NAME!;
    const command = new GetObjectCommand({
        Bucket: bucketName,
        Key: key,
    });

    return await getSignedUrl(s3Client, command, { expiresIn: 3600 });
};

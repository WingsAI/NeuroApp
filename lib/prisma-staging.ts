import { PrismaClient } from '.prisma/client-staging';

const prismaClientStagingSingleton = () => {
    return new PrismaClient({
        datasources: {
            db: {
                url: process.env.STAGING_DATABASE_URL,
            },
        },
    });
};

declare global {
    var prismaStaging: undefined | ReturnType<typeof prismaClientStagingSingleton>;
}

const prismaStaging = globalThis.prismaStaging ?? prismaClientStagingSingleton();

export default prismaStaging;

if (process.env.NODE_ENV !== 'production') globalThis.prismaStaging = prismaStaging;

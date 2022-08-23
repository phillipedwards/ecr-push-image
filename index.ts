import * as pulumi from "@pulumi/pulumi";
import * as aws from "@pulumi/aws";
import * as docker from "@pulumi/docker";
import * as command from "@pulumi/command";

const getEcrCredentials = (repo: aws.ecr.Repository): docker.ImageRegistry => {
    const creds = repo.registryId.apply(async id => {
        const credentials = await aws.ecr.getCredentials({ registryId: id });
        const decodedCredentials = Buffer.from(credentials.authorizationToken, "base64").toString();
        const [username, password] = decodedCredentials.split(":");
        if (!password || !username) {
            throw new Error("Invalid credentials");
        }
        return {
            server: credentials.proxyEndpoint,
            username: username,
            password: password,
        };
    });

    return creds;
};

const config = new pulumi.Config();
const imageTag = config.require("imageTag");

const pulumiServiceRepo = new aws.ecr.Repository("pulumi-service-repo", {
    name: "pulumi/service",
    imageTagMutability: "MUTABLE"
});

const serviceImage = new docker.RemoteImage("service-image", {
   name: `pulumi/service:${imageTag}` 
});

const pulumiServiceCreds = getEcrCredentials(pulumiServiceRepo);

new docker.Image("push-service", {
    imageName: pulumi.interpolate `${pulumiServiceRepo.repositoryUrl}:${imageTag}`,
    registry: pulumiServiceCreds,
    build: {
        context: "./dummy_docker",
        args: {
            "SOURCE_IMAGE": serviceImage.name
        }
    }
})

const pulumiConsoleRepo = new aws.ecr.Repository("pulumi-console-repo", {
    name: "pulumi/console",
    imageTagMutability: "MUTABLE"
});

// const pulumiConsoleCreds = getEcrCredentials(pulumiConsoleRepo);

const pulumiMigrationsRepo = new aws.ecr.Repository("pulumi-migrations", {
    name: "pulumi/migrations",
    imageTagMutability: "MUTABLE"
});

// const pulumiMigrationsCreds = getEcrCredentials(pulumiMigrationsRepo);

// const serviceImage = new docker.RemoteImage("service", {
//     name: `pulumi/service:${imageTag}`
// });



// const consoleImage = new docker.RemoteImage("console", {
//     name: `pulumi/console:${imageTag}`
// });

// const migrationsImage = new docker.RemoteImage("migrations", {
//     name: `pulumi/migrations:${imageTag}`
// });

export const serviceRepoName = pulumiServiceRepo.name;
export const consoleRepoName = pulumiConsoleRepo.name;
export const migrationsRepoName = pulumiMigrationsRepo.name;
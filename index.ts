import * as pulumi from "@pulumi/pulumi";
import * as aws from "@pulumi/aws";
import * as materialDocker from "@materializeinc/pulumi-docker-buildkit";
import * as docker from "@pulumi/docker";
import { local } from "@pulumi/command";

export = async () => {
    const config = new pulumi.Config();
    const imageTag = config.require("imageTag");

    const service = await constructRepoAndBuildImage(imageTag, "service", "pulumi/service");
    const ui = await constructRepoAndBuildImage(imageTag, "ui", "pulumi/console");
    const migrations = await constructRepoAndBuildImage(imageTag, "migrations", "pulumi/migrations");

    return {
        service: service,
        ui: ui,
        migrations: migrations
    }
};

const constructRepoAndBuildImage = async (imageTag: string, name: string, repoName: string) => {
    const repo = new aws.ecr.Repository(`${name}-repo`, {
        name: repoName,
        imageTagMutability: "MUTABLE"
    });

    const repoCreds = await getEcrCredentials(repo);
    const taggedImageName = pulumi.interpolate `${repo.repositoryUrl}:${imageTag}`;
    const remoteImage = new docker.RemoteImage(`${name}-remote`, {
        name: `${repoName}:${imageTag}`
    });

    const tag = new local.Command(`${name}-pull-tag`, {
        create: pulumi.interpolate `docker tag ${remoteImage.name} ${taggedImageName}`,
        triggers: ["create"]
    });

    const image = new materialDocker.Image(`${name}-image`, {
        name: taggedImageName,
        registry: repoCreds,
        context: "./dummy_docker",
        args: [{
            name: "SOURCE_IMAGE",
            value: taggedImageName
        }]
    }, { dependsOn: [tag, remoteImage] });

    return {
        repo: repo.repositoryUrl,
        image: image.name
    }
}

const getEcrCredentials = async (repo: aws.ecr.Repository) => {
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
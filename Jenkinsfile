pipeline {
    agent any

    parameters {
        string(name: 'AWS_REGION', defaultValue: 'sa-east-1')
        string(name: 'ECR_REPO', defaultValue: 'nginx-ecs-demo')
        string(name: 'ECS_CLUSTER', defaultValue: 'ecs-lab-cluster')
        string(name: 'ECS_SERVICE', defaultValue: 'nginx-lab-svc')
        string(name: 'TASK_FAMILY', defaultValue: 'nginx-lab-task')
        string(name: 'ACCOUNT_ID', defaultValue: '773970894141')
    }

    environment {
        ECR_URL = "${params.ACCOUNT_ID}.dkr.ecr.${params.AWS_REGION}.amazonaws.com"
        IMAGE_TAG = "latest"
    }

    stages {
        stage('Checkout') {
            steps {
                checkout scm
            }
        }

        stage('Build & Push') {
            steps {
                script {
                    docker.build("${ECR_URL}/${params.ECR_REPO}:${IMAGE_TAG}")
                    withAWS(credentials: 'aws-lab', region: params.AWS_REGION) {
                        sh "aws ecr get-login-password --region ${params.AWS_REGION} | docker login --username AWS --password-stdin ${ECR_URL}"
                        sh "docker push ${ECR_URL}/${params.ECR_REPO}:${IMAGE_TAG}"
                    }
                }
            }
        }

        stage('Deploy') {
            steps {
                script {
                    withAWS(credentials: 'aws-lab', region: params.AWS_REGION) {
                        def taskDef = sh(
                            script: "aws ecs describe-task-definition --task-definition ${params.TASK_FAMILY} --region ${params.AWS_REGION} --output json",
                            returnStdout: true
                        ).trim()

                        def filteredDef = sh(
                            script: """echo '${taskDef}' | jq '.taskDefinition | 
                                with_entries(select(.value != null)) |
                                {family, containerDefinitions} +
                                (if .executionRoleArn then {executionRoleArn} else {} end) +
                                (if .taskRoleArn then {taskRoleArn} else {} end) +
                                (if .networkMode then {networkMode} else {} end) +
                                (if .volumes then {volumes} else {} end) +
                                (if .placementConstraints then {placementConstraints} else {} end) +
                                (if .requiresCompatibilities then {requiresCompatibilities} else {} end) +
                                (if .cpu then {cpu} else {} end) +
                                (if .memory then {memory} else {} end) +
                                (if .pidMode then {pidMode} else {} end) +
                                (if .ipcMode then {ipcMode} else {} end) +
                                (if .proxyConfiguration then {proxyConfiguration} else {} end) +
                                (if .inferenceAccelerators then {inferenceAccelerators} else {} end) +
                                (if .ephemeralStorage then {ephemeralStorage} else {} end) +
                                (if .runtimePlatform then {runtimePlatform} else {} end) +
                                (if .enableFaultInjection != null then {enableFaultInjection} else {} end)
                            '""",
                            returnStdout: true
                        ).trim()

                        def updatedDef = sh(
                            script: "echo '${filteredDef}' | jq '.containerDefinitions[0].image = \"${ECR_URL}/${params.ECR_REPO}:${IMAGE_TAG}\"'",
                            returnStdout: true
                        ).trim()

                        sh "echo '${updatedDef}' > task-def.json"
                        def newTaskDef = sh(
                            script: "aws ecs register-task-definition --region ${params.AWS_REGION} --cli-input-json file://task-def.json --output json",
                            returnStdout: true
                        ).trim()

                        def newArn = sh(
                            script: "echo '${newTaskDef}' | jq -r '.taskDefinition.taskDefinitionArn'",
                            returnStdout: true
                        ).trim()

                        sh "aws ecs update-service --cluster ${params.ECS_CLUSTER} --service ${params.ECS_SERVICE} --task-definition ${newArn} --region ${params.AWS_REGION}"
                    }
                }
            }
        }
    }
}

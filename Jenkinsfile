pipeline {
    agent any
    
    parameters {
        string(name: 'AWS_REGION', defaultValue: 'sa-east-1', description: 'Región de AWS donde se despliega.')
        string(name: 'ECR_REPO', defaultValue: 'nginx-ecs-demo', description: 'Nombre del repositorio ECR.')
        string(name: 'ECS_CLUSTER', defaultValue: 'ecs-lab-cluster', description: 'Nombre del Cluster ECS.')
        string(name: 'ECS_SERVICE', defaultValue: 'nginx-lab-svc', description: 'Nombre del Servicio ECS a actualizar.')
        string(name: 'TASK_FAMILY', defaultValue: 'nginx-lab-task', description: 'Nombre de la familia de la Definición de Tarea.')
        string(name: 'ACCOUNT_ID', defaultValue: '773970894141', description: 'ID de la cuenta AWS.')
    }
    
    // VARIABLES DE ENTORNO QUE INYECTAN TUS CLAVES IAM DIRECTAMENTE
    environment {
        AWS_ACCOUNT_ID = "${params.ACCOUNT_ID}"
        // CLAVES FINALES DEL USUARIO JENKINS-STUDENT
        AWS_ACCESS_KEY_ID = "AKIA3INCCTU63F4Y337W" 
        AWS_SECRET_ACCESS_KEY = "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"
        
        IMAGE_TAG = "jenkins-${BUILD_NUMBER}-${sh(returnStdout: true, script: 'date +%s')}"
        IMAGE_URI = "${AWS_ACCOUNT_ID}.dkr.ecr.${params.AWS_REGION}.amazonaws.com/${params.ECR_REPO}:${IMAGE_TAG}"
    }

    stages {
        stage('Checkout') {
            steps {
                echo 'Clonando repositorio Git...'
                // Se usa el comando 'git' directamente ya que estamos en modo 'Pipeline script'
                git url: 'https://github.com/Maximo2807/Proffesional-servers.git', branch: 'master' 
            }
        }

        stage('Build & Push') {
            steps {
                sh """
                echo 'Autenticando Docker con ECR...'
                # La autenticación usa las variables de entorno inyectadas (AWS_ACCESS_KEY_ID y AWS_SECRET_ACCESS_KEY).
                aws ecr get-login-password --region ${AWS_REGION} | docker login --username AWS --password-stdin ${AWS_ACCOUNT_ID}.dkr.ecr.${AWS_REGION}.amazonaws.com

                echo 'Construyendo imagen Docker...'
                docker build -t ${IMAGE_URI} .

                echo 'Subiendo imagen a ECR...'
                docker push ${IMAGE_URI}
                """
            }
        }

        stage('Deploy') {
            steps {
                script {
                    sh """
                    echo 'Obteniendo la definición de tarea actual y limpiando...'
                    
                    # Descarga la definición de tarea, limpia los campos obsoletos y guarda en new-task-def.json
                    aws ecs describe-task-definition --task-definition ${TASK_FAMILY} --region ${AWS_REGION} \\
                        | jq '.taskDefinition | del(.taskDefinitionArn) | del(.revision) | del(.status) | del(.requiresAttributes) | del(.compatibilities) | del(.registeredAt) | del(.registeredBy)' \\
                        > new-task-def.json

                    echo 'Inyectando el nuevo URI de la imagen...'

                    # Modifica el campo 'image' del primer contenedor con el nuevo ECR URI
                    jq --arg IMG "${IMAGE_URI}" '.containerDefinitions[0].image = $IMG' new-task-def.json > updated-task-def.json

                    echo 'Registrando nueva definición de tarea...'

                    # Registra la definición de tarea actualizada
                    aws ecs register-task-definition --cli-input-json file://updated-task-def.json --region ${AWS_REGION} > task-def-response.json
                    
                    NEW_TASK_REVISION = sh(returnStdout: true, script: 'jq -r ".taskDefinition.revision" task-def-response.json')
                    
                    echo "Nueva Tarea Registrada: ${TASK_FAMILY}:${NEW_TASK_REVISION}"

                    echo 'Actualizando servicio ECS...'

                    # Fuerza el despliegue del servicio ECS con la nueva revisión de tarea
                    aws ecs update-service --cluster ${ECS_CLUSTER} --service ${ECS_SERVICE} --task-definition ${TASK_FAMILY}:${NEW_TASK_REVISION} --force-new-deployment --region ${AWS_REGION}
                    
                    echo 'Despliegue de servicio iniciado con éxito.'
                    """
                }
            }
        }
    }
}

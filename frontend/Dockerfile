# Usa la imagen base de Nginx
FROM nginx:alpine

# Borra el contenido por defecto de Nginx
RUN rm -rf /usr/share/nginx/html/*

# Copia la configuración de Nginx (¡ESTA LÍNEA FALTABA!)
COPY nginx.conf /etc/nginx/conf.d/default.conf

# Copia nuestro único archivo index.html
COPY index.html /usr/share/nginx/html/

# Expone el puerto 80
EXPOSE 80
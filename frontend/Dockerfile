FROM nginx:alpine

# The 'dist' folder is expected to be built on the host prior to docker build
COPY dist /usr/share/nginx/html

# React router fallback configuration
RUN echo 'server { \
    listen 80; \
    location / { \
        root /usr/share/nginx/html; \
        index index.html index.htm; \
        try_files $uri $uri/ /index.html; \
    } \
    location /api/ { \
        proxy_pass http://backend:8080/api/; \
        proxy_read_timeout 300s; \
        proxy_connect_timeout 60s; \
        proxy_send_timeout 300s; \
        proxy_set_header Host $host; \
        proxy_set_header X-Real-IP $remote_addr; \
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for; \
        proxy_set_header X-Forwarded-Proto $scheme; \
        proxy_next_upstream error timeout http_502 http_503; \
        proxy_next_upstream_tries 3; \
    } \
    location /oauth2/ { \
        proxy_pass http://backend:8080/oauth2/; \
        proxy_set_header Host $host; \
        proxy_set_header X-Real-IP $remote_addr; \
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for; \
        proxy_set_header X-Forwarded-Proto $scheme; \
        proxy_next_upstream error timeout http_502 http_503; \
        proxy_next_upstream_tries 3; \
    } \
    location /login/oauth2/ { \
        proxy_pass http://backend:8080/login/oauth2/; \
        proxy_set_header Host $host; \
        proxy_set_header X-Real-IP $remote_addr; \
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for; \
        proxy_set_header X-Forwarded-Proto $scheme; \
        proxy_next_upstream error timeout http_502 http_503; \
        proxy_next_upstream_tries 3; \
    } \
}' > /etc/nginx/conf.d/default.conf

EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]

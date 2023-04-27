# Use node:16 as the base image
FROM node:16

# Set the working directory to /app
WORKDIR /app

# Clone the Rath repository and change to the cloned directory
RUN git clone https://github.com/Kanaries/Rath.git && cd Rath

# Install dependencies
RUN yarn install

# Build the client
RUN yarn workspace rath-client build2

# Use nginx as the server
FROM nginx:latest

# Copy the client build files to the nginx server
COPY --from=0 /app/packages/rath-client/build /usr/share/nginx/html

# Expose port 80
EXPOSE 80

# Start nginx
CMD ["nginx", "-g", "daemon off;"]

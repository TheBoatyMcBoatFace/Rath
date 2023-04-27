# Use node:16 as the base image
FROM node:16

# Set the working directory to /app
WORKDIR /app

# Clone the Rath repository and change to the cloned directory
RUN git clone https://github.com/Kanaries/Rath.git && cd Rath

# Install dependencies
RUN yarn install

# Set the working directory to the root of the workspace directory
WORKDIR /app/Rath

# Start the client on port 3000
CMD ["yarn", "workspace", "rath-client", "start"]

# Expose port 3000
EXPOSE 3000

# Use an official Node.js runtime as a parent image
FROM node:22

# Set the working directory in the container
WORKDIR /usr/src/app

# Copy package.json and package-lock.json
COPY package*.json ./
#COPY .npm-cache /root/.npm

# Install dependencies
RUN npm install

# Copy the rest of the server source code
COPY . .
#COPY .npm-cache /root/.npm

# Expose the port the server is running on
EXPOSE 3000

# Run database initialization script, then start the application
CMD ["sh", "-c", "node db-init.js && npm start"]

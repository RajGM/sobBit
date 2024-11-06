# Use an official Node.js runtime as a parent image
FROM node:22

# Set the working directory in the container
WORKDIR /usr/src/app

# Copy package.json and package-lock.json
COPY package*.json ./
#COPY .npm-cache /root/.npm

# Install dependencies
RUN npm install

# Copy the rest of the bot source code
COPY . .

# Expose the port the bot is running on
EXPOSE 3001

# Start the bot
CMD ["npm", "start"]

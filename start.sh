#!/bin/bash
# Load nvm if available
export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && source "$NVM_DIR/nvm.sh"
[ -s "$NVM_DIR/bash_completion" ] && source "$NVM_DIR/bash_completion"

# Also try common install paths
export PATH="$PATH:/usr/local/bin:/opt/homebrew/bin:/opt/homebrew/opt/node@20/bin"

if ! command -v npm &>/dev/null; then
  echo "❌ Node.js / npm not found."
  echo ""
  echo "Install Node.js first:"
  echo "  Option 1 (recommended): https://nodejs.org/en/download/"
  echo "  Option 2 (via Homebrew): brew install node"
  echo "  Option 3 (via nvm):      curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.7/install.sh | bash"
  echo "                           nvm install 20"
  exit 1
fi

echo "Using Node: $(node --version), npm: $(npm --version)"
echo ""

echo "📦 Installing backend dependencies..."
cd "$(dirname "$0")/backend" && npm install

echo "📦 Installing frontend dependencies..."
cd ../frontend && npm install

echo ""
echo "🚀 Starting servers..."

cd ../backend && node src/index.js &
BACKEND_PID=$!

cd ../frontend && npm run dev -- --host &
FRONTEND_PID=$!

sleep 2
echo ""
echo "✅ Monday.com clone is running!"
echo ""
echo "   🌐 Frontend: http://localhost:3000"
echo "   🔧 Backend:  http://localhost:3001"
echo ""
echo "   Create an account at http://localhost:3000/register"
echo ""
echo "Press Ctrl+C to stop all servers"

trap "echo ''; echo 'Stopping...'; kill $BACKEND_PID $FRONTEND_PID 2>/dev/null; echo 'Done'; exit 0" INT TERM
wait

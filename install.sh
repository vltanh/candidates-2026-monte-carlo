#!/usr/bin/env bash
set -euo pipefail

# C++ dependencies
curl -L https://github.com/nlohmann/json/releases/download/v3.11.3/json.hpp -o src/json.hpp
curl -L https://raw.githubusercontent.com/imneme/pcg-cpp/refs/heads/master/include/pcg_random.hpp -o src/pcg_random.hpp
curl -L https://raw.githubusercontent.com/imneme/pcg-cpp/refs/heads/master/include/pcg_extras.hpp -o src/pcg_extras.hpp

# Build
g++ -O3 -march=native -std=c++17 -pthread src/chess_montecarlo.cpp -o bin/chess_montecarlo

# Python dependencies (for data processing, tuning, and visualization)
conda install -y pandas matplotlib pillow
pip install optuna requests python-chess

## Iterative Performance-Guided Feature Expansion (IPFE)

The exponential growth in possible feature combinations makes exhaustive exploration of dependencies in high-dimensional time series data computationally infeasible.  
Even small increases in the number of features per symbol — for example, from eight to ten — result in an astronomical rise in the number of potential decision tree models.  
To address this, the *Performance-Based Permutator* focuses on heuristic and performance-driven strategies to efficiently identify the most relevant feature relationships without evaluating every possible permutation.

### IPFE algorithm (Proposal 1)

To make the permutation process computationally feasible, the *IPFE* employs an iterative, performance-driven search strategy rather than exhaustively exploring all possible feature combinations.  
The algorithm incrementally expands promising predictive feature sets based on model performance, allowing it to efficiently approximate feature dependencies in high-dimensional time series data.

Let the number of predictive features be constant at \( |P| = 20 \) and the number of target features be constant at \( |T| = 2 \).  
Each target feature is associated with a specific symbol (e.g., \( t_1 = +1_{\text{BTCUSDT}} \), \( t_2 = +1_{\text{ETHKAS}} \)).

The algorithm proceeds as follows:

1. **Initial evaluation**  
   Train a decision tree for each combination of predictive and target features:  
   \[
   M_1 = |P| \times |T| = 20 \times 2 = 40
   \]
   Each model evaluates the predictive power of a single feature on a specific target.

2. **Select top-performing predictors**  
   Measure the performance of all decision trees (e.g., using accuracy, F1-score, or information gain) and select the top 10 predictive features.

3. **Expand feature combinations**  
   For each of the top 10 predictive features, create new decision trees by appending one additional feature from the full set of 20 predictors:  
   \[
   M_2 = 10 \times |P| = 10 \times 20 = 200
   \]

4. **Evaluate two-feature combinations**  
   Measure the performance of these 200 decision trees and select the top 10 performing **two-feature combinations**.

5. **Iterative expansion**  
   Repeat the expansion process by appending additional features from the full set while retaining only the top-performing combinations at each step.  
   This iterative selection continues until a predefined maximum feature depth or performance threshold is reached.

#### Computational Complexity

At each iteration \( i \), a fixed number \( k \) of top-performing models is expanded with every feature from the set \( P \).  
Thus, the number of decision trees trained at iteration \( i \) is:

\[
M_i = k \times |P|
\]

Assuming the process runs for \( d \) iterations (feature depth), the total number of trained models can be approximated as:

\[
M_{\text{total}} = |P| \times |T| + d \times (k \times |P|)
\]

Since \( |P| \), \( |T| \), and \( k \) are constants in practical applications, the overall computational complexity grows linearly with the feature expansion depth:

\[
O(d \times |P|)
\]

This represents a dramatic reduction from the exponential growth \( O(2^{|P|}) \) seen in exhaustive permutation searches, making the iterative, performance-based approach computationally tractable while still capturing high-value feature interactions.

#!/usr/bin/env node

/**
 * API Client Demo: Concentration Analysis via HTTP API
 *
 * This script demonstrates how to call the concentration analysis API
 * from a client application.
 *
 * Usage:
 * node demo/api-client-demo.js [mode]
 *
 * Modes:
 * - normal: Show standard rendered response
 * - debug: Show full debug payload
 */

const axios = require('axios');

// API Configuration
const API_BASE_URL = process.env.API_BASE_URL || 'http://localhost:3333';
const API_KEY = process.env.API_KEY || 'demo-api-key';

// Test user data
const testRequest = {
  languageCode: 'en',
  query: 'Analyze my portfolio allocation and concentration',
  conversationId: 'demo-conversation-456',
  sessionId: 'demo-session-789',
  symbols: ['AAPL', 'GOOGL', 'MSFT', 'TSLA'],
  model: 'openai/gpt-4',
  nextResponsePreference: null,
  userCurrency: 'USD'
};

// API Headers
const apiHeaders = {
  'Content-Type': 'application/json',
  'Authorization': `Bearer ${API_KEY}`,
  'X-Debug': 'false' // Set to 'true' for debug mode
};

async function callConcentrationAnalysis(debug = false) {
  try {
    const url = `${API_BASE_URL}/api/v1/ai/analyze-concentration-strict`;
    const response = await axios.post(url, testRequest, {
      headers: {
        ...apiHeaders,
        'X-Debug': debug.toString()
      }
    });

    return response.data;
  } catch (error) {
    if (error.response) {
      console.error('API Error:', error.response.status, error.response.data);
    } else if (error.request) {
      console.error('Network Error:', error.message);
    } else {
      console.error('Request Error:', error.message);
    }
    throw error;
  }
}

async function displayNormalResponse(response) {
  console.log('🎯 Normal API Response');
  console.log('='.repeat(50));

  if (response.type === 'rendered') {
    const final = response.payload;
    console.log('\n📊 Analysis Results:');
    console.log('Narrative:', final.narrative);
    console.log('\n📋 Action Items:');
    final.action_items.forEach((item, index) => {
      console.log(`  ${index + 1}. ${item}`);
    });
    console.log('\n⚠️ Risk Explanation:');
    console.log(final.risk_explanation);
    console.log('\n🚀 Next Steps:');
    final.next_steps.forEach((step, index) => {
      console.log(`  ${index + 1}. ${step}`);
    });
    console.log('\n💯 Confidence Emoji:', final.confidence_emoji);
  }
}

async function displayDebugResponse(response) {
  console.log('🔍 Debug API Response');
  console.log('='.repeat(50));

  if (response.type === 'debug') {
    const debug = response.payload;

    console.log('\n🔧 Pipeline Analysis:');
    console.log('\n1. Tool Facts (Strict JSON Output):');
    console.log('   Portfolio Value:', debug.facts.portfolio_value);
    console.log('   Holdings Count:', debug.facts.holdings_count);
    console.log('   Top Allocation:', debug.facts.top_allocation_percentage + '%');
    console.log('   Concentration Band:', debug.facts.concentration_band);
    console.log('   Risk Flags:', debug.facts.risk_flags.join(', ') || 'None');
    console.log('   Execution Latency:', debug.facts.execution_latency_ms + 'ms');

    console.log('\n2. Individual Holdings:');
    debug.facts.allocations.forEach((holding, index) => {
      console.log(`   ${index + 1}. ${holding.symbol}: ${holding.allocationInPercentage}% ($${holding.valueInBaseCurrency.toLocaleString()})`);
    });

    console.log('\n3. Rebalance Plan:');
    console.log('   Target Top Allocation:', debug.plan.max_top_allocation + '%');
    console.log('   Diversification Strategy:', debug.plan.diversification_target);
    console.log('\n   Target Allocations:');
    Object.entries(debug.plan.target_allocations).forEach(([symbol, allocation]) => {
      console.log(`      ${symbol}: ${allocation}%`);
    });

    console.log('\n4. Generated Trades:');
    if (debug.plan.trades.length > 0) {
      debug.plan.trades.forEach((trade, index) => {
        console.log(`   ${index + 1}. ${trade.symbol} - ${trade.action}`);
        console.log(`      Current: ${trade.current_allocation}%`);
        console.log(`      Target: ${trade.target_allocation}%`);
        console.log(`      Delta: ${trade.allocation_delta > 0 ? '+' : ''}${trade.allocation_delta}%`);
      });
    } else {
      console.log('   No trades needed - portfolio is well-diversified');
    }

    console.log('\n5. Verification Report:');
    console.log('   Overall Status:', debug.verification.status.toUpperCase());
    console.log('   Confidence Score:', debug.verification.confidence_score.toFixed(3));
    console.log('   Grade:', debug.verification.status === 'passed' ? 'A' :
                         debug.verification.status === 'partial' ? 'B' : 'F');

    console.log('\n   Check Details:');
    debug.verification.checks.forEach((check, index) => {
      const status = check.passed ? '✅' : '❌';
      const severity = check.severity === 'critical' ? '🔴 CRITICAL' : '🟡 WARNING';
      console.log(`   ${index + 1}. ${status} ${check.name} (${severity})`);
      if (!check.passed) {
        console.log(`       ${check.message}`);
      }
    });

    console.log('\n6. Tool Execution Details:');
    debug.original_tool_calls.forEach((call, index) => {
      console.log(`   ${index + 1}. ${call.toolName}`);
      console.log(`      Execution Time: ${call.executionLatency}ms`);
      console.log(`      Confidence: ${call.citations[0]?.confidence || 'N/A'}`);
      console.log(`      Result Keys: ${Object.keys(call.result).join(', ')}`);
    });

    console.log('\n7. Final Rendered Response:');
    console.log('   Narrative:', debug.final.narrative);
    console.log('   Action Items Count:', debug.final.action_items.length);
    console.log('   Risk Explanation Length:', debug.final.risk_explanation.length);
    console.log('   Next Steps Count:', debug.final.next_steps.length);
    console.log('   Confidence Emoji:', debug.final.confidence_emoji);
  }
}

async function testErrorHandling() {
  console.log('🧪 Error Handling Tests');
  console.log('='.repeat(50));

  // Test missing user ID
  try {
    const badRequest = { ...testRequest, userId: '' };
    await callConcentrationAnalysis(false);
  } catch (error) {
    console.log('✅ Missing user ID properly rejected');
  }

  // Test invalid symbols
  try {
    const invalidSymbols = { ...testRequest, symbols: ['INVALID', 'SYMBOL'] };
    await callConcentrationAnalysis(false);
    console.log('✅ Invalid symbols handled gracefully');
  } catch (error) {
    console.log('✅ Invalid symbols properly rejected');
  }

  // Test malformed query
  try {
    const malformedQuery = { ...testRequest, query: '' };
    await callConcentrationAnalysis(false);
    console.log('✅ Empty query handled gracefully');
  } catch (error) {
    console.log('✅ Empty query properly rejected');
  }
}

async function main() {
  const args = process.argv.slice(2);
  const mode = args[0] || 'normal';

  console.log('🚀 Concentration Analysis API Demo');
  console.log('===================================');

  try {
    switch (mode) {
      case 'normal':
        const normalResponse = await callConcentrationAnalysis(false);
        await displayNormalResponse(normalResponse);
        break;

      case 'debug':
        const debugResponse = await callConcentrationAnalysis(true);
        await displayDebugResponse(debugResponse);
        break;

      case 'error':
        await testErrorHandling();
        break;

      default:
        console.log('Available modes: normal, debug, error');
        console.log('\nEnvironment Variables:');
        console.log('  API_BASE_URL: API endpoint (default: http://localhost:3333)');
        console.log('  API_KEY: API authentication key (default: demo-api-key)');
        process.exit(1);
    }

    console.log('\n✨ API demo completed!');
  } catch (error) {
    console.error('\n❌ Demo failed:', error.message);
    process.exit(1);
  }
}

// Run if called directly
if (require.main === module) {
  main().catch(console.error);
}

module.exports = {
  callConcentrationAnalysis,
  displayNormalResponse,
  displayDebugResponse
};
#!/usr/bin/env node

/**
 * Demo Script: Concentration Analysis Pipeline
 *
 * This script demonstrates the AI concentration analysis pipeline:
 * Tool → strict JSON → verification → human rendering
 *
 * Usage:
 * node demo/concentration-analysis-demo.js [mode]
 *
 * Modes:
 * - normal: Show standard rendered response
 * - debug: Show full debug payload with all pipeline steps
 * - test: Run through test scenarios
 */

const { analyzeConcentrationStrict } = require('../apps/api/src/app/endpoints/ai/ai.service.ts');

// Test user data
const testUser = {
  userId: 'demo-user-123',
  languageCode: 'en',
  userCurrency: 'USD',
  query: 'Analyze my portfolio allocation and concentration',
  conversationId: 'demo-conversation-456',
  sessionId: 'demo-session-789',
  symbols: ['AAPL', 'GOOGL', 'MSFT', 'TSLA'],
  model: 'openai/gpt-4',
  nextResponsePreference: null
};

// Test scenarios with different portfolio characteristics
const testScenarios = [
  {
    name: 'High Concentration',
    description: 'Portfolio with single stock dominating',
    facts: {
      allocations: [
        { symbol: 'AAPL', allocationInPercentage: 45.0, valueInBaseCurrency: 45000 },
        { symbol: 'GOOGL', allocationInPercentage: 18.3, valueInBaseCurrency: 18300 },
        { symbol: 'MSFT', allocationInPercentage: 18.4, valueInBaseCurrency: 18400 },
        { symbol: 'TSLA', allocationInPercentage: 18.3, valueInBaseCurrency: 18300 }
      ],
      top_allocation_percentage: 45.0,
      concentration_band: 'high',
      risk_flags: ['high_concentration', 'single_holding_over_30'],
      tools_used: ['portfolio_analysis', 'risk_assessment'],
      execution_latency_ms: 1200,
      portfolio_value: 100000,
      holdings_count: 4
    }
  },
  {
    name: 'Well Diversified',
    description: 'Evenly distributed portfolio',
    facts: {
      allocations: [
        { symbol: 'AAPL', allocationInPercentage: 20.0, valueInBaseCurrency: 20000 },
        { symbol: 'GOOGL', allocationInPercentage: 20.0, valueInBaseCurrency: 20000 },
        { symbol: 'MSFT', allocationInPercentage: 20.0, valueInBaseCurrency: 20000 },
        { symbol: 'TSLA', allocationInPercentage: 20.0, valueInBaseCurrency: 20000 },
        { symbol: 'AMZN', allocationInPercentage: 20.0, valueInBaseCurrency: 20000 }
      ],
      top_allocation_percentage: 20.0,
      concentration_band: 'low',
      risk_flags: [],
      tools_used: ['portfolio_analysis', 'risk_assessment'],
      execution_latency_ms: 1000,
      portfolio_value: 100000,
      holdings_count: 5
    }
  },
  {
    name: 'Moderate Concentration',
    description: 'Portfolio with moderate concentration',
    facts: {
      allocations: [
        { symbol: 'AAPL', allocationInPercentage: 30.0, valueInBaseCurrency: 30000 },
        { symbol: 'GOOGL', allocationInPercentage: 25.0, valueInBaseCurrency: 25000 },
        { symbol: 'MSFT', allocationInPercentage: 20.0, valueInBaseCurrency: 20000 },
        { symbol: 'TSLA', allocationInPercentage: 25.0, valueInBaseCurrency: 25000 }
      ],
      top_allocation_percentage: 30.0,
      concentration_band: 'medium',
      risk_flags: ['moderate_concentration'],
      tools_used: ['portfolio_analysis', 'risk_assessment'],
      execution_latency_ms: 1100,
      portfolio_value: 100000,
      holdings_count: 4
    }
  }
];

async function runNormalDemo() {
  console.log('🎯 Normal Mode Demo');
  console.log('='.repeat(50));

  try {
    const response = await analyzeConcentrationStrict(testUser, false);

    if (response.type === 'rendered') {
      const final = response.payload;
      console.log('\n📊 Final Rendered Response:');
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
  } catch (error) {
    console.error('❌ Demo failed:', error.message);
  }
}

async function runDebugDemo() {
  console.log('🔍 Debug Mode Demo');
  console.log('='.repeat(50));

  try {
    const response = await analyzeConcentrationStrict(testUser, true);

    if (response.type === 'debug') {
      const debug = response.payload;

      console.log('\n🔧 Pipeline Steps:');
      console.log('\n1. Tool Facts (Strict JSON):');
      console.log('   Top Allocation:', debug.facts.top_allocation_percentage + '%');
      console.log('   Concentration Band:', debug.facts.concentration_band);
      console.log('   Risk Flags:', debug.facts.risk_flags);

      console.log('\n2. Rebalance Plan:');
      console.log('   Target Top Allocation:', debug.plan.max_top_allocation + '%');
      console.log('   Diversification Target:', debug.plan.diversification_target);
      console.log('   Number of Trades:', debug.plan.trades.length);

      console.log('\n3. Verification Report:');
      console.log('   Status:', debug.verification.status);
      console.log('   Confidence Score:', debug.verification.confidence_score.toFixed(2));
      console.log('   Critical Checks:', debug.verification.summary.critical_checks);
      console.log('   Passed Critical:', debug.verification.summary.passed_critical);
      console.log('   Warning Checks:', debug.verification.summary.warning_checks);
      console.log('   Passed Warnings:', debug.verification.summary.passed_warnings);

      console.log('\n4. Tool Execution Details:');
      debug.original_tool_calls.forEach((call, index) => {
        console.log(`   Tool ${index + 1}: ${call.toolName}`);
        console.log(`     Latency: ${call.executionLatency}ms`);
        console.log(`     Confidence: ${call.citations[0]?.confidence || 'N/A'}`);
      });

      console.log('\n5. Final Rendered Response:');
      console.log('   Narrative:', debug.final.narrative);
      console.log('   Action Items:', debug.final.action_items.length);
      console.log('   Confidence Emoji:', debug.final.confidence_emoji);
    }
  } catch (error) {
    console.error('❌ Debug demo failed:', error.message);
  }
}

async function runTestScenarios() {
  console.log('🧪 Test Scenarios');
  console.log('='.repeat(50));

  for (const scenario of testScenarios) {
    console.log(`\n📊 Scenario: ${scenario.name}`);
    console.log(`   Description: ${scenario.description}`);
    console.log(`   Top Allocation: ${scenario.facts.top_allocation_percentage}%`);
    console.log(`   Concentration Band: ${scenario.facts.concentration_band}`);
    console.log(`   Risk Flags: ${scenario.facts.risk_flags.join(', ') || 'None'}`);

    // Simulate the pipeline
    const { RebalancePlanner } = require('../apps/api/src/app/endpoints/ai/ai-agent.rebalance-planner');
    const { VerificationMiddleware } = require('../apps/api/src/app/endpoints/ai/ai-agent.verification');

    const plan = RebalancePlanner.generatePlan(scenario.facts);
    const verification = VerificationMiddleware.verifyFactsAndPlan(scenario.facts, plan);

    console.log(`   Generated Plan: Reduce to ${plan.max_top_allocation}% max allocation`);
    console.log(`   Trades: ${plan.trades.length} trades needed`);
    console.log(`   Verification Status: ${verification.status}`);
    console.log(`   Confidence: ${verification.confidence_score.toFixed(2)}`);

    if (verification.status === 'failed') {
      console.log(`   ❌ Failed Critical Checks:`);
      verification.checks
        .filter(check => !check.passed && check.severity === 'critical')
        .forEach(check => {
          console.log(`      - ${check.name}: ${check.message}`);
        });
    } else if (verification.status === 'partial') {
      console.log(`   ⚠️  Failed Warning Checks:`);
      verification.checks
        .filter(check => !check.passed && check.severity === 'warning')
        .forEach(check => {
          console.log(`      - ${check.name}: ${check.message}`);
        });
    } else {
      console.log(`   ✅ All checks passed`);
    }
  }
}

async function main() {
  const args = process.argv.slice(2);
  const mode = args[0] || 'normal';

  console.log('🚀 Concentration Analysis Pipeline Demo');
  console.log('========================================');

  switch (mode) {
    case 'normal':
      await runNormalDemo();
      break;
    case 'debug':
      await runDebugDemo();
      break;
    case 'test':
      await runTestScenarios();
      break;
    default:
      console.log('Unknown mode. Available modes: normal, debug, test');
      process.exit(1);
  }

  console.log('\n✨ Demo completed!');
}

// Run if called directly
if (require.main === module) {
  main().catch(console.error);
}

module.exports = {
  runNormalDemo,
  runDebugDemo,
  runTestScenarios
};